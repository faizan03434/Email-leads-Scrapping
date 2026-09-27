import postgres from 'postgres';
import {createClient} from '@supabase/supabase-js';
import {validateSupabase} from './validation';
import type {Configuration} from './store';
export async function testSupabase(config:Configuration){
 validateSupabase(config);
 const url=config.NEXT_PUBLIC_SUPABASE_URL!,secret=config.SUPABASE_SERVICE_ROLE_KEY!,publishable=config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
 const response=await fetch(url+'/auth/v1/settings',{headers:{apikey:publishable},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Supabase project URL or publishable key was rejected');
 const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const bucket=await client.storage.getBucket('resumes');if(bucket.error||!bucket.data||bucket.data.public||Number(bucket.data.file_size_limit)!==5000000)throw new Error('A private resumes bucket with the 5 MB limit is required');
 const sql=postgres(config.DATABASE_URL!,{prepare:false,max:1,connect_timeout:8,ssl:'require',connection:{statement_timeout:10000}});
 try{
  const tables=await sql`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('leads','campaigns','deliveries','events','industries','memberships','replies','searchJobs','sendLocks','settings','suppressions','auditLogs')`;
  if(tables.length!==12||!tables.every(t=>t.rowsecurity))throw new Error('Apply the app migrations to this project before connecting');
  const grants=await sql`SELECT count(*)::integer AS n FROM information_schema.table_privileges WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND table_name IN ('leads','campaigns','deliveries','events','industries','memberships','replies','searchJobs','sendLocks','settings','suppressions','auditLogs')`;
  if(grants[0].n)throw new Error('Browser roles must not have direct access to app tables');
  return 'Database, API keys and private storage verified.';
 }finally{await sql.end({timeout:2});}
}
export async function testSendGrid(config:Configuration){if(!config.SENDGRID_API_KEY)throw new Error('Enter a SendGrid API key');const response=await fetch('https://api.sendgrid.com/v3/scopes',{headers:{Authorization:'Bearer '+config.SENDGRID_API_KEY},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('SendGrid could not validate this key (check its permissions)');const body=await response.json() as {scopes?:string[]};if(!body.scopes?.includes('mail.send'))throw new Error('The key needs the mail.send permission');return 'SendGrid key verified. No email was sent.';}
