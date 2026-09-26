import {z} from 'zod';
import {db,originCheck,failure,HttpError,now,leadSchema,addLeads,getSettings,suppress,runtime} from '@/lib/server';
import {access,authorize,canManage} from '@/lib/access';
import {sendCampaign} from '@/lib/outreach';
import {createSearchJob,processSearchJob} from '@/lib/search-jobs';
import {availableProviders} from '@/lib/providers';
import type {Lead} from '@/lib/domain';
import type {Campaign,Reply,SearchJob,Membership,AuditEntry} from '@/lib/types';
const id=z.string().uuid(),text=z.string().trim().min(1).max(300);
const classification=z.enum(['Needs review','Interested','Not interested','Question','Unsubscribe','Out of office','Unknown']);
type Payload=Record<string,unknown>;
function where(user:string,d:Payload){
 const clauses=['owner=?'],values:(string|number)[]=[user];
 for(const [key,all] of [['industry','All industries'],['state','All states'],['status','All statuses'],['type','All lead types']]){if(typeof d[key]==='string'&&d[key]&&d[key]!==all){clauses.push(`${key}=?`);values.push(d[key]);}}
 for(const key of ['city','query','skills'])if(typeof d[key]==='string'&&d[key]){const s='%'+d[key].slice(0,300).replace(/[\\%_]/g,'\\$&')+'%';const columns=key==='query'?['name','email','company','jobTitle']:key==='skills'?['skills','experience']:['city'];clauses.push('('+columns.map(c=>`${c} LIKE ? ESCAPE '\\'`).join(' OR ')+')');values.push(...columns.map(()=>s));}
 if(d.segment==='Interested')clauses.push("status IN ('Interested','Qualified')");
 if(d.segment==='Contacted'){clauses.push("(status='Contacted' OR id IN (SELECT leadId FROM deliveries WHERE owner=? AND status IN ('Sent','Delivered')))");values.push(user);}
 if(d.segment==='Replied'){clauses.push('id IN (SELECT leadId FROM replies WHERE owner=?)');values.push(user);}
 if(Array.isArray(d.ids)&&d.ids.length){const ids=z.array(id).max(1000).parse(d.ids);clauses.push(`id IN (${ids.map(()=>'?').join(',')})`);values.push(...ids);}
 return{sql:clauses.join(' AND '),values};
}
export async function POST(req:Request){
 try{originCheck(req);const ctx=await access();const raw=await req.text();if(raw.length>3_000_000)throw new HttpError(413,'Request too large');const {action,data:d}=z.object({action:z.string(),data:z.record(z.unknown()).default({})}).parse(JSON.parse(raw));authorize(ctx.role,action);
 const response=await execute(action,d,ctx);
 if(response.ok&&!['list','jobStatus','auditHistory'].includes(action))await db().prepare('INSERT INTO auditLogs (id,workspaceId,actorId,actorEmail,action,entityId,summary,createdAt) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),ctx.workspaceId,ctx.userId,ctx.email,action,typeof d.id==='string'?d.id:'',Array.isArray(d.rows)?`${d.rows.length} import rows`:Array.isArray(d.ids)?`${d.ids.length} records`:Array.isArray(d.leadIds)?`${d.leadIds.length} recipients`:'Workspace action completed',now()).run();
 return response;
 }catch(e){return failure(e);}
}
async function execute(action:string,d:Payload,ctx:Awaited<ReturnType<typeof access>>){
 const user=ctx.workspaceId,database=db();
 if(action==='list'||action==='export'){
  const w=where(user,d);
  if(action==='export'){const rows=await database.prepare(`SELECT * FROM leads WHERE ${w.sql} ORDER BY createdAt DESC LIMIT 10001`).bind(...w.values).all<Lead>();if(rows.results.length>10000)throw new HttpError(413,'More than 10,000 matches. Narrow the filters before exporting.');return Response.json({leads:rows.results});}
  const page=z.number().int().min(1).max(100000).parse(d.page||1);
  const [list,count,stats,industry,campaigns,replies,settings,jobs,members,audit]=await Promise.all([
   database.prepare(`SELECT * FROM leads WHERE ${w.sql} ORDER BY createdAt DESC,id DESC LIMIT 25 OFFSET ?`).bind(...w.values,(page-1)*25).all<Lead>(),
   database.prepare(`SELECT COUNT(*) n FROM leads WHERE ${w.sql}`).bind(...w.values).first<{n:number}>(),
   database.prepare("SELECT COUNT(*) total,COALESCE(SUM(status IN ('Interested','Qualified')),0) interested,COALESCE(SUM(status='Contacted' OR id IN (SELECT leadId FROM deliveries WHERE owner=? AND status IN ('Sent','Delivered'))),0) contacted FROM leads WHERE owner=?").bind(user,user).first<{total:number;interested:number;contacted:number}>(),
   database.prepare('SELECT name FROM industries WHERE owner=? ORDER BY name').bind(user).all<{name:string}>(),
   database.prepare("SELECT c.*, (SELECT COUNT(*) FROM deliveries d WHERE d.campaignId=c.id) enrolled, (SELECT COUNT(*) FROM deliveries d WHERE d.campaignId=c.id AND d.status IN ('Sent','Delivered')) sent FROM campaigns c WHERE owner=? ORDER BY createdAt DESC LIMIT 200").bind(user).all<Campaign>(),
   database.prepare('SELECT r.*,l.name,l.email FROM replies r JOIN leads l ON l.id=r.leadId WHERE r.owner=? ORDER BY r.createdAt DESC LIMIT 200').bind(user).all<Reply>(),
   getSettings(user),database.prepare('SELECT * FROM searchJobs WHERE owner=? ORDER BY createdAt DESC LIMIT 100').bind(user).all<SearchJob>(),
   canManage(ctx.role)?database.prepare('SELECT * FROM memberships WHERE workspaceId=? ORDER BY createdAt').bind(user).all<Membership>():Promise.resolve({results:[]}),
   canManage(ctx.role)?database.prepare('SELECT * FROM auditLogs WHERE workspaceId=? ORDER BY createdAt DESC LIMIT 200').bind(user).all<AuditEntry>():Promise.resolve({results:[]})]);
  const replyCount=await database.prepare('SELECT COUNT(*) n FROM replies WHERE owner=?').bind(user).first<{n:number}>();const e=runtime();return Response.json({leads:list.results,total:count?.n||0,stats:{...stats,replies:replyCount?.n||0},industries:[...new Set(['Life Insurance','Hiring / Recruitment',...industry.results.map(r=>r.name)])],campaigns:campaigns.results,replies:replies.results,settings,jobs:jobs.results,members:members.results,audit:audit.results,access:ctx,providers:availableProviders(e),connections:{leadApi:availableProviders(e).some(p=>p.configured),email:!!(( e.SENDGRID_API_KEY||(e.GMAIL_USER&&e.GMAIL_APP_PASSWORD))&&e.APP_URL&&e.UNSUBSCRIBE_SECRET),inbound:!!(e.INBOUND_WEBHOOK_SECRET||(e.SENDGRID_PARSE_PUBLIC_KEY&&e.INBOUND_REPLY_DOMAIN)),scheduler:!!e.SCHEDULER_SECRET}});
 }
 if(action==='switchWorkspace'){const workspaceId=text.parse(d.workspaceId);if(!ctx.workspaces.some(w=>w.workspaceId===workspaceId))throw new HttpError(403,'Workspace access denied');return Response.json({message:'Workspace changed'},{headers:{'Set-Cookie':`leadflow-workspace=${encodeURIComponent(workspaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV==='production'?'; Secure':''}`}});}
 if(action==='saveMember'){const input=z.object({email:z.string().email().transform(s=>s.toLowerCase()),role:z.enum(['admin','member','viewer'])}).parse(d);if(input.email===ctx.email)throw new HttpError(400,'You cannot change your own role here.');const current=await database.prepare('SELECT role FROM memberships WHERE workspaceId=? AND email=?').bind(user,input.email).first<{role:string}>();if(current?.role==='owner')throw new HttpError(403,'The owner cannot be changed.');if(ctx.role==='admin'&&(input.role==='admin'||current?.role==='admin'))throw new HttpError(403,'Only the owner can manage administrators.');await database.prepare("INSERT INTO memberships (id,workspaceId,email,role,status,createdAt) VALUES (?,?,?,?,'Active',?) ON CONFLICT(workspaceId,email) DO UPDATE SET role=excluded.role,status='Active'").bind(crypto.randomUUID(),user,input.email,input.role,now()).run();return Response.json({message:'Workspace access saved. No invitation email was sent. Site-level sharing must also permit this user.'});}
 if(action==='disableMember'){const member=await database.prepare('SELECT * FROM memberships WHERE id=? AND workspaceId=?').bind(id.parse(d.id),user).first<Membership>();if(!member)throw new HttpError(404,'Member not found');if(member.role==='owner'||member.userId===ctx.userId||ctx.role==='admin'&&member.role==='admin')throw new HttpError(403,'This member cannot be disabled by your role.');await database.prepare("UPDATE memberships SET status='Disabled' WHERE id=? AND workspaceId=?").bind(member.id,user).run();return Response.json({message:'Workspace access disabled'});}
 if(action==='saveLead'){
  const lead=leadSchema.parse(d);lead.email=lead.email.toLowerCase();
  if(lead.id){const existing=await database.prepare('SELECT * FROM leads WHERE id=? AND owner=?').bind(lead.id,user).first<Lead>();if(!existing)throw new HttpError(404,'Lead not found');if(existing.status==='Unsubscribed'&&lead.status!=='Unsubscribed')throw new HttpError(409,'Suppressed leads cannot be reactivated here.');
   const keys=(Object.keys(lead) as (keyof typeof lead)[]).filter(k=>k!=='id');try{await database.prepare(`UPDATE leads SET ${keys.map(k=>k+'=?').join(',')},updatedAt=? WHERE id=? AND owner=?`).bind(...keys.map(k=>k==='email'||k==='sourceRef'?(lead[k]||null):(lead[k]??'')),now(),lead.id,user).run();}catch(e){if(String(e).includes('UNIQUE'))throw new HttpError(409,'A lead with this email or source record already exists.');throw e;}
  }else{const result=await addLeads(user,[lead]);if(!result.imported)throw new HttpError(409,'This lead already exists.');}
  if(lead.status==='Unsubscribed')await suppress(user,lead.email,'Manual unsubscribe');return Response.json({ok:true});
 }
 if(action==='import')return Response.json(await addLeads(user,z.array(z.record(z.unknown())).min(1).max(1000).parse(d.rows)));
 if(action==='bulkStatus'){const ids=z.array(id).min(1).max(1000).parse(d.ids),status=z.enum(['New','Contacted','Interested','Not interested','Qualified']).parse(d.status);for(let i=0;i<ids.length;i+=50)await database.batch(ids.slice(i,i+50).map(value=>database.prepare("UPDATE leads SET status=?,updatedAt=? WHERE id=? AND owner=? AND status!='Unsubscribed'").bind(status,now(),value,user)));return Response.json({ok:true});}
 if(action==='addIndustry'){await database.prepare('INSERT INTO industries (id,owner,name) VALUES (?,?,?) ON CONFLICT(owner,name) DO NOTHING').bind(crypto.randomUUID(),user,text.parse(d.name)).run();return Response.json({ok:true});}
 if(action==='saveSettings'){const s=z.object({senderName:text,senderEmail:z.string().email(),replyTo:z.string().email(),postalAddress:z.string().trim().min(10).max(1000),dailyLimit:z.number().int().min(1).max(1000)}).parse(d);if(/[\r\n<>]/.test(s.senderName))throw new HttpError(400,'Invalid sender name');await database.prepare('INSERT INTO settings (owner,value) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value').bind(user,JSON.stringify(s)).run();return Response.json({ok:true});}
 if(action==='saveCampaign'){const c=z.object({id:id.optional(),name:text,industry:text,subject:z.string().min(1).max(500),body:z.string().min(1).max(30000)}).parse(d);if(c.id){const current=await database.prepare('SELECT status FROM campaigns WHERE id=? AND owner=?').bind(c.id,user).first<{status:string}>();if(!current)throw new HttpError(404,'Campaign not found');const sent=await database.prepare("SELECT COUNT(*) n FROM deliveries WHERE campaignId=? AND owner=? AND status!='Queued'").bind(c.id,user).first<{n:number}>();if(sent?.n||current.status==='Active'||current.status==='Cancelled')throw new HttpError(409,'This campaign has started or is cancelled. Create a new campaign to change its message.');await database.prepare('UPDATE campaigns SET name=?,industry=?,subject=?,body=? WHERE id=? AND owner=?').bind(c.name,c.industry,c.subject,c.body,c.id,user).run();}else await database.prepare('INSERT INTO campaigns (id,owner,name,industry,subject,body,status,createdAt) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user,c.name,c.industry,c.subject,c.body,'Draft',now()).run();return Response.json({ok:true});}
 if(action==='enroll'){const campaignId=id.parse(d.campaignId),ids=z.array(id).min(1).max(1000).parse(d.leadIds);const c=await database.prepare('SELECT industry,status FROM campaigns WHERE id=? AND owner=?').bind(campaignId,user).first<{industry:string;status:string}>();if(!c)throw new HttpError(404,'Campaign not found');if(c.status==='Cancelled')throw new HttpError(409,'Campaign is cancelled');let enrolled=0;for(let i=0;i<ids.length;i+=50){const results=await database.batch(ids.slice(i,i+50).map(leadId=>database.prepare("INSERT INTO deliveries (id,owner,campaignId,leadId,status,createdAt) SELECT ?,?,?,id,'Queued',? FROM leads WHERE id=? AND owner=? AND industry=? AND email IS NOT NULL AND permission!='Unknown' AND status!='Unsubscribed' AND NOT EXISTS(SELECT 1 FROM suppressions s WHERE s.owner=leads.owner AND s.email=leads.email) ON CONFLICT(campaignId,leadId) DO NOTHING").bind(crypto.randomUUID(),user,campaignId,now(),leadId,user,c.industry)));enrolled+=results.reduce((n,r)=>n+r.meta.changes,0);}return Response.json({enrolled,message:`${enrolled} eligible leads enrolled. Duplicates and ineligible contacts were excluded.`});}
 if(action==='activateCampaign'){const campaignId=id.parse(d.id),active=z.boolean().parse(d.active);if(active&&!runtime().SCHEDULER_SECRET)throw new HttpError(409,'Configure a scheduler before enabling automation.');const updated=await database.prepare("UPDATE campaigns SET status=? WHERE id=? AND owner=? AND status!='Cancelled'").bind(active?'Active':'Paused',campaignId,user).run();if(!updated.meta.changes)throw new HttpError(409,'Campaign is missing or cancelled');return Response.json({message:active?'Scheduled sending enabled':'Campaign paused; an already accepted email cannot be recalled.'});}
 if(action==='cancelCampaign'){const campaignId=id.parse(d.id);await database.batch([database.prepare("UPDATE campaigns SET status='Cancelled' WHERE id=? AND owner=?").bind(campaignId,user),database.prepare("UPDATE deliveries SET status='Cancelled' WHERE campaignId=? AND owner=? AND status='Queued'").bind(campaignId,user)]);return Response.json({message:'Campaign cancelled. Already accepted emails cannot be recalled.'});}
 if(action==='sendCampaign')return Response.json(await sendCampaign(user,id.parse(d.id)));
 if(action==='logReply'){const r=z.object({email:z.string().email(),subject:text,body:z.string().min(1).max(50000),classification}).parse(d);const lead=await database.prepare('SELECT id,email FROM leads WHERE owner=? AND email=?').bind(user,r.email.toLowerCase()).first<{id:string;email:string}>();if(!lead)throw new HttpError(404,'No lead found for that email');await database.prepare('INSERT INTO replies (id,owner,leadId,subject,body,classification,createdAt) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user,lead.id,r.subject,r.body,r.classification,now()).run();await applyClassification(user,lead.id,lead.email,r.classification);return Response.json({ok:true});}
 if(action==='classifyReply'){const replyId=id.parse(d.id),c=classification.parse(d.classification);const r=await database.prepare('SELECT r.leadId,l.email FROM replies r JOIN leads l ON l.id=r.leadId WHERE r.id=? AND r.owner=?').bind(replyId,user).first<{leadId:string;email:string}>();if(!r)throw new HttpError(404,'Reply not found');await database.prepare('UPDATE replies SET classification=? WHERE id=? AND owner=?').bind(c,replyId,user).run();await applyClassification(user,r.leadId,r.email,c);return Response.json({ok:true});}
 if(action==='generate')return Response.json(await createSearchJob(user,d));
 if(action==='runJob')return Response.json(await processSearchJob(user,id.parse(d.id)));
 if(action==='cancelJob'){await database.prepare("UPDATE searchJobs SET status='Cancelled',updatedAt=? WHERE id=? AND owner=? AND status!='Completed'").bind(now(),id.parse(d.id),user).run();return Response.json({message:'Cancellation saved. Imported leads remain available.'});}
 if(action==='enrichLeads'){
  const batchKey=runtime().BATCHDATA_API_KEY;
  if(!batchKey)throw new HttpError(409,'BatchData API key not configured. Set BATCHDATA_API_KEY in environment.');
  // Get leads with no email (up to 100 at a time — BatchData limit per call)
  const targets=await database.prepare("SELECT * FROM leads WHERE owner=? AND (email IS NULL OR email='') LIMIT 100").bind(user).all<Lead>();
  if(!targets.results.length)return Response.json({message:'All leads already have an email address.',matched:0,attempted:0});
  const leads=targets.results;
  // Call BatchData skip-trace API
  let bdResults:unknown[]=[];
  let warnings:string[]=[];
  try{
   const bdRes=await fetch('https://api.batchdata.com/api/v1/property/skip-trace',{
    method:'POST',
    headers:{Authorization:`Bearer ${batchKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({requests:leads.map(l=>({address:{street:l.address||l.city,city:l.city,state:l.state,zip:(l as any).zip||''}}))}),
    signal:AbortSignal.timeout(30000),
   });
   if(!bdRes.ok){const t=await bdRes.text().catch(()=>'');throw new Error(`BatchData returned ${bdRes.status}: ${t.slice(0,200)}`);}
   const bdJson=await bdRes.json() as any;
   bdResults=bdJson?.results?.persons||bdJson?.results||bdJson?.persons||[];
   if(!Array.isArray(bdResults))bdResults=[];
  }catch(e){warnings.push(e instanceof Error?e.message:'BatchData request failed');}
  // Map results back to leads
  let matched=0;
  const updates:Array<{id:string;email:string;phone:string}>=[];
  leads.forEach((lead,i)=>{
   const result:any=bdResults[i];
   if(!result)return;
   const person=result?.person||result?.owner||result;
   const emails:any[]=person?.emails||result?.emails||[];
   const phones:any[]=person?.phoneNumbers||result?.phoneNumbers||person?.phones||[];
   const email=Array.isArray(emails)?(typeof emails[0]==='string'?emails[0]:emails[0]?.email||''):'';
   const phone=Array.isArray(phones)?(typeof phones[0]==='string'?phones[0]:phones[0]?.number||''):'';
   if(email&&email.includes('@')){updates.push({id:lead.id,email:email.toLowerCase(),phone:phone||''});matched++;}
  });
  // Apply updates
  if(updates.length){
   await database.batch(updates.map(u=>
    database.prepare("UPDATE leads SET email=?,phone=CASE WHEN phone='' THEN ? ELSE phone END,updatedAt=? WHERE id=? AND owner=? AND (email IS NULL OR email='')").bind(u.email,u.phone,now(),u.id,user)
   ));
  }
  const msg=`${matched} of ${leads.length} leads enriched with email${warnings.length?` (warning: ${warnings[0]})`:''}`;
  return Response.json({ok:true,matched,attempted:leads.length,message:msg,warnings});
 }
 if(action==='retryJob'){await database.prepare("UPDATE searchJobs SET status='Queued',attempts=0,error='',nextRunAt=?,leaseUntil=0,updatedAt=? WHERE id=? AND owner=? AND status='Failed'").bind(now(),now(),id.parse(d.id),user).run();return Response.json({message:'Search queued from its saved cursor.'});}
 if(action==='auditHistory'){if(!canManage(ctx.role))throw new HttpError(403,'Administrator access required');const rows=await database.prepare('SELECT * FROM auditLogs WHERE workspaceId=? AND entityId=? ORDER BY createdAt DESC LIMIT 200').bind(user,id.parse(d.id)).all<AuditEntry>();return Response.json({audit:rows.results});}
 throw new HttpError(400,'Unknown action');
}
async function applyClassification(user:string,leadId:string,email:string,c:string){if(c==='Unsubscribe')return suppress(user,email,'Reply unsubscribe');if(c==='Interested'||c==='Not interested')await db().prepare("UPDATE leads SET status=?,updatedAt=? WHERE id=? AND owner=? AND status!='Unsubscribed'").bind(c,now(),leadId,user).run();}
