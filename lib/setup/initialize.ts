import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {migrations} from './migrations';
import {validateSupabase} from './validation';
import type {Configuration} from './store';
export async function initializeSupabase(config:Configuration){
 validateSupabase(config);
 const sql=postgres(config.DATABASE_URL!,{prepare:false,max:1,connect_timeout:8,ssl:'require',connection:{statement_timeout:15000}});
 try{await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(72109341)`;
  const existing=await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('leads','campaigns','deliveries','events','industries','memberships','replies','searchJobs','sendLocks','settings','suppressions','auditLogs','app_configuration','admin_login_attempts','leadflow_migrations')`;
  if(existing.length)throw new Error('This project already contains app tables. Use Verify & save instead.');
  await tx.unsafe('CREATE TABLE public.leadflow_migrations (name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE public.leadflow_migrations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.leadflow_migrations FROM anon,authenticated;');
  for(const migration of migrations){await tx.unsafe(migration.sql);await tx`INSERT INTO public.leadflow_migrations (name,checksum) VALUES (${migration.name},${createHash('sha256').update(migration.sql).digest('hex')})`;}
 });}finally{await sql.end({timeout:2});}
}
