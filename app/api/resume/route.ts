import {withConfiguration} from '@/lib/setup/store';
import {access,authorize} from '@/lib/access';
import {db,owner,originCheck,failure,HttpError,now,signature,equal} from '@/lib/server';
import {storageClient} from '@/lib/supabase/server';
import {z} from 'zod';
import {getConfiguration} from '@/lib/setup/store';
export const maxDuration=60;
async function getHandler(req:Request){try{
 const workspace=await owner(),id=new URL(req.url).searchParams.get('id');
 const lead=await db().prepare('SELECT resumeKey FROM leads WHERE id=? AND owner=?').bind(id,workspace).first<{resumeKey:string|null}>();
 if(!lead?.resumeKey)throw new HttpError(404,'Resume not found');
 const {data,error}=await (await storageClient()).createSignedUrl(lead.resumeKey,60,{download:'resume.'+(lead.resumeKey.endsWith('.pdf')?'pdf':'docx')});
 if(error)throw new HttpError(404,'Resume not found');
 return new Response(null,{status:302,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
async function postHandler(req:Request){try{
 originCheck(req);const ctx=await access();authorize(ctx.role,'saveLead');
 const input=z.object({action:z.enum(['prepare','complete']),id:z.string().uuid(),name:z.string().max(300).optional(),size:z.number().int().positive().max(5_000_000).optional(),key:z.string().max(600).optional(),expires:z.number().int().optional(),proof:z.string().optional()}).parse(await req.json());
 const lead=await db().prepare('SELECT id,resumeKey FROM leads WHERE id=? AND owner=?').bind(input.id,ctx.workspaceId).first<{id:string;resumeKey:string|null}>();
 if(!lead)throw new HttpError(404,'Lead not found');
 const config=await getConfiguration();const bucket=await storageClient(),secret=config.SUPABASE_SERVICE_ROLE_KEY!;
 if(input.action==='prepare'){
  const ext=input.name?.split('.').pop()?.toLowerCase();
  if(!input.size||(ext!=='pdf'&&ext!=='docx'))throw new HttpError(400,'Choose a PDF or DOCX under 5 MB');
  const key=`pending/${ctx.workspaceId}/${lead.id}/${crypto.randomUUID()}.${ext}`,expires=Date.now()+600000;
  const {data,error}=await bucket.createSignedUploadUrl(key);
  if(error)throw new HttpError(503,'Unable to prepare upload');
  return Response.json({key,token:data.token,url:config.NEXT_PUBLIC_SUPABASE_URL,publishableKey:config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,expires,proof:await signature(secret,`${ctx.userId}:${key}:${expires}`)});
 }
 const {key,expires,proof}=input;
 if(!key||!expires||expires<Date.now()||!proof||!key.startsWith(`pending/${ctx.workspaceId}/${lead.id}/`)||!equal(proof,await signature(secret,`${ctx.userId}:${key}:${expires}`)))throw new HttpError(400,'Upload expired or invalid. Please upload again.');
 const {data:file,error}=await bucket.download(key);
 if(error||!file)throw new HttpError(400,'Uploaded file not found');
 const bytes=new Uint8Array(await file.arrayBuffer()),ext=key.endsWith('.pdf')?'pdf':'docx';
 if(!bytes.length||bytes.length>5_000_000||(ext==='pdf'?new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-':bytes[0]!==80||bytes[1]!==75)){
  await bucket.remove([key]);throw new HttpError(400,'File content does not match a PDF or DOCX under 5 MB');
 }
 // Use a new immutable key; the upload token cannot alter the validated file.
 const finalKey=`resumes/${ctx.workspaceId}/${lead.id}/${crypto.randomUUID()}.${ext}`;
 const uploaded=await bucket.upload(finalKey,bytes,{contentType:'application/octet-stream',upsert:false});
 if(uploaded.error)throw new HttpError(503,'Unable to save resume');
 try{
  const updated=await db().prepare('UPDATE leads SET resumeKey=?,updatedAt=? WHERE id=? AND owner=? AND (resumeKey=? OR (resumeKey IS NULL AND CAST(? AS text) IS NULL))').bind(finalKey,now(),lead.id,ctx.workspaceId,lead.resumeKey,lead.resumeKey).run();
  if(!updated.meta.changes)throw new HttpError(409,'Resume changed during upload. Please retry.');
 }catch(e){await bucket.remove([finalKey]);throw e;}
 await bucket.remove([key,...(lead.resumeKey?[lead.resumeKey]:[])]);
 return Response.json({key:finalKey});
}catch(e){return failure(e);}}

export function GET(req:Request){return withConfiguration(()=>getHandler(req));}
export function POST(req:Request){return withConfiguration(()=>postHandler(req));}
