import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';
const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
if(!url)throw new Error('Set MIGRATION_DATABASE_URL or DATABASE_URL');
const sql=postgres(url,{prepare:false,max:1,ssl:process.env.DATABASE_SSL==='false'?false:'require'});
try{
 await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(72109341)`;
  await tx`CREATE TABLE IF NOT EXISTS public.leadflow_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
  await tx`ALTER TABLE public.leadflow_migrations ENABLE ROW LEVEL SECURITY`;
  await tx`REVOKE ALL ON TABLE public.leadflow_migrations FROM anon, authenticated`;
  for(const name of fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).sort()){
   const content=fs.readFileSync(path.join('supabase/migrations',name),'utf8').replace(/\r\n/g,'\n');
   const checksum=crypto.createHash('sha256').update(content).digest('hex');
   const [existing]=await tx`SELECT checksum FROM public.leadflow_migrations WHERE name=${name}`;
   if(existing){if(existing.checksum!==checksum)throw new Error(`Applied migration changed: ${name}`);continue;}
   await tx.unsafe(content);
   await tx`INSERT INTO public.leadflow_migrations (name,checksum) VALUES (${name},${checksum})`;
   console.log(`Applied ${name}`);
  }
 });
 console.log('Database migrations complete.');
}catch(error){console.error('Migration failed:',error.code||error.name);process.exitCode=1;}finally{await sql.end();}
