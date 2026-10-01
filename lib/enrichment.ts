import {z} from 'zod';
import {db,runtime,now,HttpError} from './server';
import {readSetting,writeSetting} from './setup/store';
import {advancedTraceBody,tracerfyRequest,traceRow,traceContact,traceIdentity} from './tracerfy';
import type {Lead} from './domain';
type TraceJob={queueId?:number;status:'submitting'|'pending'|'complete';targets:Lead[]};
type TraceHistory={attempted:string[];job?:TraceJob};
export async function enrichLeads(user:string){
 const key=(await runtime()).TRACERFY_API_KEY;
 if(!key)throw new HttpError(409,'Add your Tracerfy API key in Setup & connections → Tracerfy.');
 const database=db(),lockKey=`tracerfy:${user}`,token=crypto.randomUUID();
 const lock=await database.prepare('INSERT INTO sendLocks (owner,expiresAt,token) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET expiresAt=excluded.expiresAt,token=excluded.token WHERE sendLocks.expiresAt<?').bind(lockKey,Date.now()+240000,token,Date.now()).run();
 if(!lock.meta.changes)throw new HttpError(409,'Tracerfy enrichment is already being processed.');
 const setting=`tracerfy:${user}`;
 try{
  const history=await readSetting<TraceHistory>(setting)||{attempted:[]};
  if(history.job?.status==='submitting')throw new HttpError(409,'A Tracerfy submission has an uncertain outcome. Check your Tracerfy queues before retrying; automatic resubmission is blocked to prevent duplicate charges.');
  if(history.job?.status==='pending'){
   const job=history.job;
   let queue:{id:number;pending:boolean}|undefined;
   for(let page=1;page<=5;page++){
    const queues=z.array(z.object({id:z.number(),pending:z.boolean()})).parse(await tracerfyRequest(key,`queues/?page=${page}`));
    queue=queues.find(q=>q.id===job.queueId);if(queue||queues.length<100)break;
   }
   if(!queue)throw new HttpError(409,'Saved Tracerfy queue was not found in this account. Check the API key and queue in Tracerfy.');
   if(queue.pending)return {message:'Tracerfy is still processing. Click Check Tracerfy results again shortly. No new batch was submitted.',pending:true,matched:0};
   const rows=z.array(traceRow).parse(await tracerfyRequest(key,`queue/${job.queueId}`));
   // Never match by array position: misses disappear and the provider can reorder rows.
   const groups=new Map<string,typeof rows>();for(const row of rows){const identity=traceIdentity(row);groups.set(identity,[...(groups.get(identity)||[]),row]);}
   let matched=0,phones=0,ambiguous=0;
   for(const target of job.targets){
    const candidates=groups.get(traceIdentity(target))||[];if(candidates.length>1){ambiguous++;continue;}if(!candidates.length)continue;
    const {email,phone}=traceContact(candidates[0]);if(!email&&!phone)continue;
    const changed=await database.prepare("UPDATE leads SET email=CASE WHEN (email IS NULL OR email='') AND ?!='' THEN ? ELSE email END,phone=CASE WHEN phone='' THEN ? ELSE phone END,updatedAt=? WHERE id=? AND owner=? AND address=? AND city=? AND state=? AND (email IS NULL OR email='') AND (?='' OR NOT EXISTS(SELECT 1 FROM leads other WHERE other.owner=? AND other.email=? AND other.id!=?))").bind(email,email,phone,now(),target.id,user,target.address,target.city,target.state,email,user,email,target.id).run();
    if(changed.meta.changes){if(email)matched++;if(phone)phones++;}
   }
   history.attempted.push(...job.targets.map(l=>l.id));history.job={...job,status:'complete'};await writeSetting(setting,history);
   return {message:`Tracerfy complete: ${matched} emails and ${phones} phones saved from ${job.targets.length} property leads.${ambiguous?` ${ambiguous} ambiguous matches skipped.`:''} Contact permission remains unchanged.`,matched,phones,pending:false};
  }
  const candidates=await database.prepare("SELECT * FROM leads WHERE owner=? AND type='Property owner' AND (email IS NULL OR email='') AND address!='' AND city!='' AND state!='' AND status!='Unsubscribed' ORDER BY createdAt,id").bind(user).all<Lead>();
  const seen=new Set<string>();const attempted=new Set(history.attempted);
  const targets=candidates.results.filter(l=>{const identity=traceIdentity(l);if(attempted.has(l.id)||seen.has(identity))return false;seen.add(identity);return true;}).slice(0,1000);
  if(!targets.length)return {message:'No untraced property leads with a complete address are available. Import or generate property leads first.',matched:0,pending:false};
  history.job={status:'submitting',targets};await writeSetting(setting,history);
  let result:unknown;
  try{result=await tracerfyRequest(key,'trace/',advancedTraceBody(targets));}catch(e){
   // Explicit rejection is safe to retry; transport failures may have created a paid queue.
   if(e instanceof Error&&/credits are insufficient|rejected the API|rate limit|HTTP 400/.test(e.message)){delete history.job;await writeSetting(setting,history);}
   throw e;
  }
  const queueId=z.object({queue_id:z.number().int().positive()}).parse(result).queue_id;
  history.job={status:'pending',queueId,targets};await writeSetting(setting,history);
  return {message:`Tracerfy batch submitted for ${targets.length} property leads. Advanced owner lookup costs 2 credits ($0.04) per successful result. Click Check Tracerfy results shortly to import contacts.`,pending:true,attempted:targets.length,matched:0};
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(502,e instanceof z.ZodError?'Tracerfy response did not match its documented format. The saved batch was preserved.':e instanceof Error?e.message:'Tracerfy request failed.');}
 finally{await database.prepare('DELETE FROM sendLocks WHERE owner=? AND token=?').bind(lockKey,token).run();}
}
