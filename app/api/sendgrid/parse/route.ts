import {withConfiguration} from '@/lib/setup/store';
import {z} from 'zod';
import {db,runtime,HttpError,now,failure} from '@/lib/server';
import {verifySendGrid} from '@/lib/sendgrid-security';
import {storageClient} from '@/lib/supabase/server';
import {createHash} from 'node:crypto';

// Allowed attachment MIME types and their extensions
const ALLOWED:{mime:string;ext:string}[]=[
 {mime:'application/pdf',ext:'pdf'},
 {mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ext:'docx'},
 {mime:'application/msword',ext:'doc'},
 {mime:'application/octet-stream',ext:''},// checked by magic bytes below
];
const MAX_ATTACHMENT=5_000_000;// 5 MB per file

// Validate file by magic bytes: PDF = %PDF-, DOCX/DOC = PK zip header
function detectExt(bytes:Uint8Array):string|null{
 if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)return'pdf';
 if(bytes[0]===0x50&&bytes[1]===0x4B)return'docx';
 return null;
}

async function postHandler(req:Request){
 try{
  const key=(await runtime()).SENDGRID_PARSE_PUBLIC_KEY;
  if(!key)throw new HttpError(503,'Inbound Parse signature verification not configured');
  if(Number(req.headers.get('content-length'))>6_000_000)throw new HttpError(413,'Message exceeds 6 MB');
  const raw=new Uint8Array(await req.arrayBuffer());
  if(raw.length>6_000_000)throw new HttpError(413,'Message exceeds 6 MB');
  if(!verifySendGrid(raw,req.headers.get('x-twilio-email-event-webhook-timestamp')||'',req.headers.get('x-twilio-email-event-webhook-signature')||'',key))
   throw new HttpError(401,'Invalid SendGrid signature');

  const form=await new Response(raw,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();

  // Resolve delivery + lead from reply+<UUID>@<domain> recipient
  const envelope=z.object({to:z.array(z.string()).default([])}).parse(JSON.parse(String(form.get('envelope')||'{}')));
  const addresses=Array.isArray(envelope.to)?envelope.to:[];
  const domain=(await runtime()).INBOUND_REPLY_DOMAIN;
  const recipient=addresses.find((a:string)=>typeof a==='string'&&a.toLowerCase().endsWith('@'+domain));
  const deliveryId=recipient?.match(/^reply\+([a-f0-9-]{36})@/i)?.[1];
  if(!deliveryId)return Response.json({ignored:true});

  const database=db();
  const delivery=await database.prepare(
   'SELECT d.*,l.email,l.resumeKey FROM deliveries d JOIN leads l ON l.id=d.leadId WHERE d.id=?'
  ).bind(deliveryId).first<{owner:string;leadId:string;email:string;resumeKey:string|null}>();
  if(!delivery)return Response.json({ignored:true});

  // Idempotency
  const headers=String(form.get('headers')||'');
  const messageId=headers.match(/^message-id:\s*(.+)$/im)?.[1].trim();
  const text=String(form.get('text')||'').slice(0,50000);
  const eventId='parse:'+createHash('sha256').update(deliveryId+'|'+(messageId||headers+'|'+text)).digest('hex');
  if(await database.prepare('SELECT id FROM events WHERE id=?').bind(eventId).first())
   return Response.json({duplicate:true});

  const subject=String(form.get('subject')||'(No subject)').slice(0,1000);
  const attachmentCount=Number(form.get('attachments')||0);

  // ── Auto-save first valid PDF/DOCX attachment as resume ──────────────────
  let savedResumeKey:string|null=null;
  let attachmentNote='';

  if(attachmentCount>0){
   try{
    const bucket=await storageClient();
    for(let i=1;i<=Math.min(attachmentCount,5);i++){
     const file=form.get(`attachment${i}`);
     if(!(file instanceof File))continue;
     if(file.size===0||file.size>MAX_ATTACHMENT)continue;

     const bytes=new Uint8Array(await file.arrayBuffer());
     const ext=detectExt(bytes);
     if(!ext)continue;// not PDF or DOCX — skip silently

     // Store in resumes bucket: resumes/owner/leadId/uuid.ext
     const finalKey=`resumes/${delivery.owner}/${delivery.leadId}/${crypto.randomUUID()}.${ext}`;
     const {error:uploadError}=await bucket.upload(finalKey,bytes,{
      contentType:'application/octet-stream',
      upsert:false,
     });
     if(uploadError)continue;

     // Update lead.resumeKey — only if no resume already exists or overwrite
     await database.prepare(
      'UPDATE leads SET resumeKey=?,updatedAt=? WHERE id=? AND owner=?'
     ).bind(finalKey,now(),delivery.leadId,delivery.owner).run();

     // Clean up old resume from storage if exists
     if(delivery.resumeKey&&delivery.resumeKey!==finalKey){
      await bucket.remove([delivery.resumeKey]).catch(()=>{});
     }

     savedResumeKey=finalKey;
     attachmentNote=`\n\n[Resume automatically saved from attachment (${ext.toUpperCase()}). Download from the lead detail panel.]`;
     break;// save only the first valid attachment as resume
    }
    if(!savedResumeKey&&attachmentCount>0){
     attachmentNote='\n\n[This reply included attachments but none were a valid PDF or DOCX under 5 MB. Upload the resume manually from the lead detail panel.]';
    }
   }catch{
    // Storage not configured or failed — note it but don't fail the whole reply
    attachmentNote='\n\n[This reply includes attachments. Storage is not configured — upload the resume manually from the lead detail panel.]';
   }
  }

  const body=`From: ${String(form.get('from')||'Unknown sender').slice(0,300)}\n\n${text||'[No plain-text body supplied]'}${attachmentNote}`;

  // Save reply + idempotency event atomically
  try{
   await database.batch([
    database.prepare('INSERT INTO events (id,createdAt) VALUES (?,?)').bind(eventId,now()),
    database.prepare(
     'INSERT INTO replies (id,owner,leadId,subject,body,classification,createdAt) VALUES (?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(),delivery.owner,delivery.leadId,subject,body,'Needs review',now()),
   ]);
  }catch(e){
   if(!await database.prepare('SELECT id FROM events WHERE id=?').bind(eventId).first())throw e;
  }

  return Response.json({ok:true,resumeSaved:!!savedResumeKey});
 }catch(e){return failure(e);}
}

export function POST(req:Request){return withConfiguration(()=>postHandler(req));}
