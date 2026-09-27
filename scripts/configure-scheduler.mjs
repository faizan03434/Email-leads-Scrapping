import postgres from 'postgres';
const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
const app=process.env.APP_URL,secret=process.env.CRON_SECRET||process.env.SCHEDULER_SECRET;
if(!url||!app||!secret)throw new Error('Set DATABASE_URL, APP_URL and CRON_SECRET first');
const origin=new URL(app);if(origin.protocol!=='https:')throw new Error('APP_URL must use HTTPS');
const sql=postgres(url,{prepare:false,max:1,ssl:'require'});
try{
 await sql.begin(async tx=>{
  await tx.unsafe('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net; CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;');
  for(const [name,value] of [['leadflow_app_url',origin.origin],['leadflow_cron_secret',secret]]){
   const [found]=await tx`SELECT id FROM vault.secrets WHERE name=${name}`;
   if(found)await tx`SELECT vault.update_secret(${found.id}::uuid,${value},${name})`;
   else await tx`SELECT vault.create_secret(${value},${name})`;
  }
  const command=`SELECT net.http_post(
   url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='leadflow_app_url') || '/api/automation',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='leadflow_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 290000
  );`;
  await tx`SELECT cron.schedule('leadflow-automation','* * * * *',${command})`;
 });
 console.log('Supabase scheduler configured: leadflow-automation runs every minute.');
}catch(error){console.error('Scheduler setup failed:',error.code||error.name);process.exitCode=1;}finally{await sql.end();}
