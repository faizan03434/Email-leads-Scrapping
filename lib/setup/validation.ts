import {createHash} from 'node:crypto';
import {findGroup} from './catalog.ts';
export const revisionOf=(payload:string)=>createHash('sha256').update(payload).digest('hex');
export function validatedChanges(groupId:string,values:Record<string,string>){
 const group=findGroup(groupId);if(!group)throw new Error('Unknown settings group');
 for(const [key,value] of Object.entries(values)){
  const field=group.fields.find(field=>field.key===key);if(!field)throw new Error('Unknown setting');if(value.length>12000)throw new Error('Setting is too long');
  if(field.kind==='boolean'&&!['true','false'].includes(value))throw new Error('Choose enabled or disabled');
  if(field.kind==='url'&&value){const url=new URL(value);if(url.username||url.password)throw new Error('URL must not contain credentials');if(url.protocol!=='https:'&&!(key==='APP_URL'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use an HTTPS URL');}
  if(key==='INBOUND_REPLY_DOMAIN'&&value&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value))throw new Error('Enter a domain without a URL path');
  if(['CRON_SECRET','UNSUBSCRIBE_SECRET','INBOUND_WEBHOOK_SECRET'].includes(key)&&value&&value.length<32)throw new Error('Signing secrets must have at least 32 characters');
 }
 return values;
}
export function validateSupabase(config:Record<string,string|undefined>){
 const url=new URL(config.NEXT_PUBLIC_SUPABASE_URL||'');if(url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.username||url.password||url.port||url.search||url.hash)throw new Error('Use the hosted Supabase project URL');
 const db=new URL(config.DATABASE_URL||'');if(!['postgres:','postgresql:'].includes(db.protocol)||(!db.hostname.endsWith('.pooler.supabase.com')&&db.hostname!==`db.${url.hostname}`)||!db.username||!db.password||!['5432','6543'].includes(db.port))throw new Error('Use a Supabase PostgreSQL pooler connection string with username and encoded password');
 const project=url.hostname.split('.')[0];if(db.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(db.username)!==`postgres.${project}`)throw new Error('Pooler username must belong to this Supabase project');
 if(!config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!config.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Both Supabase keys are required');
}
