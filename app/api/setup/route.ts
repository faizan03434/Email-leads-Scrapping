import {z} from 'zod';
import {controlDatabase} from '@/db/control';
import {getConfiguration,withConfiguration,type Configuration} from '@/lib/setup/store';
import {decrypt,encrypt} from '@/lib/setup/security';
import {revisionOf,validatedChanges} from '@/lib/setup/validation';
import {setupGroups,findGroup} from '@/lib/setup/catalog';
import {testSupabase,testSendGrid,testTracerfy} from '@/lib/setup/checks';
import {initializeSupabase} from '@/lib/setup/initialize';
import {failure,HttpError,originCheck} from '@/lib/server';
export const maxDuration=60;
export async function GET(){try{const [row]=await controlDatabase()`SELECT payload FROM public.app_configuration WHERE name='integrations'`;const saved=row?decrypt<Configuration>(row.payload,'integrations'):{},effective={...process.env,...saved};return Response.json({revision:revisionOf(row?.payload||''),groups:setupGroups.map(group=>({...group,fields:group.fields.map(field=>({...field,configured:!!effective[field.key],source:Object.hasOwn(saved,field.key)?'dashboard':'deployment',value:field.secret?'':effective[field.key]||''}))}))},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
async function postHandler(req:Request){try{
 originCheck(req);
 const raw=await req.text();if(raw.length>100000)throw new HttpError(413,'Request too large');
 const input=z.object({action:z.enum(['save','test','restoreSupabase','initializeSupabase']),group:z.string().optional(),values:z.record(z.string()).default({}),revision:z.string().optional(),confirmSwitch:z.boolean().optional()}).parse(JSON.parse(raw));
 const group=findGroup(['restoreSupabase','initializeSupabase'].includes(input.action)?'supabase':input.group||'');if(!group)throw new HttpError(400,'Unknown settings group');
 let changes:Record<string,string>;try{changes=validatedChanges(group.id,input.values);}catch{throw new HttpError(400,'Invalid setting. Check URLs, secret lengths and field values.');}
 const effective=await getConfiguration(),candidate={...effective,...changes};
 if(input.action==='restoreSupabase'){for(const field of group.fields)candidate[field.key]=process.env[field.key];}
 if(group.id==='supabase'&&input.action!=='test'){
  if(!input.confirmSwitch)throw new HttpError(400,'Confirm the connection switch. Existing data is not copied.');
 }
 if(input.action==='initializeSupabase'){try{await initializeSupabase(candidate);}catch{throw new HttpError(400,'Could not initialize this project. It must be reachable and contain no existing app tables. Existing configuration was kept.');}}
 let message='Settings saved. New requests use the updated values.';
 if(group.id==='supabase'||input.action==='test'){
  if(!group.testable)throw new HttpError(400,'This provider has no non-billable connection test. Save its settings, then run a search when ready.');
  try{message=group.id==='supabase'?await testSupabase(candidate):group.id==='tracerfy'?await testTracerfy(candidate):await testSendGrid(candidate);}catch{throw new HttpError(400,'Connection check failed. Verify the credentials, required migrations, private bucket and provider permissions. Existing settings were kept.');}
 }
 if(input.action==='test')return Response.json({message});
 await controlDatabase().begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(72109342)`;
  const [row]=await tx`SELECT payload FROM public.app_configuration WHERE name='integrations' FOR UPDATE`;
  if(input.revision!==revisionOf(row?.payload||''))throw new HttpError(409,'Settings changed elsewhere. Reload before saving.');
  const saved=row?decrypt<Configuration>(row.payload,'integrations'):{};
  if(input.action==='restoreSupabase'){for(const field of group.fields)delete saved[field.key];}else Object.assign(saved,changes);
  await tx`INSERT INTO public.app_configuration (name,payload) VALUES ('integrations',${encrypt(saved,'integrations')}) ON CONFLICT(name) DO UPDATE SET payload=excluded.payload,updated_at=now()`;
 });
 return Response.json({message:group.id==='supabase'?'Verified connection saved. Existing records remain in their original project.':message});
}catch(error){return failure(error);}}
export function POST(req:Request){return withConfiguration(()=>postHandler(req));}
