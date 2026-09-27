import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';
import {compileSql,createDatabase} from '../db/adapter.ts';
const pg=new PGlite();
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
for(const name of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
const execute=async(sql,values)=>{const r=await pg.query(sql,values);return{rows:r.rows,count:r.affectedRows??r.rows.length};};
const db=createDatabase(execute,statements=>pg.transaction(async tx=>{const results=[];for(const s of statements){const r=await tx.query(compileSql(s.sql),s.values);results.push({results:r.rows,meta:{changes:r.affectedRows??r.rows.length}});}return results;}));
test('PostgreSQL preserves tenant uniqueness, case-sensitive field names and nullable emails',async()=>{
 const insert=(id,owner,email,ref)=>db.prepare('INSERT INTO leads (id,owner,name,email,industry,source,sourceRef,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,'Alice',email,'Insurance','Test',ref,'','').run();
 await insert('a','owner-a','alice@example.com','source-a');
 await assert.rejects(insert('b','owner-a','alice@example.com','source-b'),{code:'23505'});
 await insert('c','owner-b','alice@example.com','source-a');await insert('d','owner-a',null,null);await insert('e','owner-a',null,null);
 await assert.rejects(insert('f','owner-a',null,'source-a'),{code:'23505'});
 const row=await db.prepare('SELECT sourceRef,createdAt FROM leads WHERE id=?').bind('a').first();assert.equal(row.sourceRef,'source-a');assert.equal(row.createdAt,'');
 assert.equal((await db.prepare('SELECT * FROM leads WHERE owner=?').bind('owner-b').all()).results.length,1);
 await db.prepare('INSERT INTO campaigns (id,owner,name,industry,subject,body,createdAt) VALUES (?,?,?,?,?,?,?)').bind('campaign','owner-a','Test','Insurance','Hello','Hello','').run();
 await db.prepare('INSERT INTO deliveries (id,owner,campaignId,leadId,createdAt) VALUES (?,?,?,?,?)').bind('delivery','owner-a','campaign','a','').run();
 await assert.rejects(db.prepare('INSERT INTO deliveries (id,owner,campaignId,leadId,createdAt) VALUES (?,?,?,?,?)').bind('delivery-2','owner-a','campaign','a','').run(),{code:'23505'});
});
test('PostgreSQL batches roll back all effects on duplicate webhook events',async()=>{
 await db.prepare('INSERT INTO events VALUES (?,?)').bind('event','').run();
 await assert.rejects(db.batch([db.prepare('INSERT INTO settings VALUES (?,?)').bind('tenant','{}'),db.prepare('INSERT INTO events VALUES (?,?)').bind('event','')]),{code:'23505'});
 assert.equal(await db.prepare('SELECT * FROM settings WHERE owner=?').bind('tenant').first(),null);
});
test('Millisecond leases and affected row counts support retry and concurrent send exclusion',async()=>{
 const lock=()=>db.prepare('INSERT INTO sendLocks (owner,expiresAt,token) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET expiresAt=excluded.expiresAt,token=excluded.token WHERE sendLocks.expiresAt < ?').bind('tenant',Date.now()+300000,'token',Date.now()).run();
 assert.equal((await lock()).meta.changes,1);assert.equal((await lock()).meta.changes,0);
 await db.prepare('INSERT INTO searchJobs (id,owner,provider,criteria,requested,nextRunAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)').bind('job','tenant','rentcast','{}',100,'','','').run();
 const claim=()=>db.prepare("UPDATE searchJobs SET status='Running',leaseUntil=? WHERE id=? AND leaseUntil<? AND status IN ('Queued','Running','Retrying')").bind(Date.now()+60000,'job',Date.now()).run();
 assert.equal((await claim()).meta.changes,1);assert.equal((await claim()).meta.changes,0);
 await db.prepare("UPDATE searchJobs SET status='Cancelled',leaseUntil=0 WHERE id=?").bind('job').run();assert.equal((await claim()).meta.changes,0);
});
test('Every static application query plans on PostgreSQL, including aggregates and upserts',async()=>{
 const files=['lib/server.ts','lib/access.ts','lib/outreach.ts','lib/search-jobs.ts',...fs.readdirSync('app/api',{recursive:true}).filter(f=>f.endsWith('route.ts')).map(f=>'app/api/'+f)];let count=0;
 for(const file of files){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const queries=[];
  function visit(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='prepare'&&n.arguments[0]&&(ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0])))queries.push(n.arguments[0].text);ts.forEachChild(n,visit);}visit(source);
  for(const query of queries){const sql=compileSql(query);const params=[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));try{await pg.query('EXPLAIN '+sql,Array(Math.max(0,...params)).fill(null));}catch(error){throw new Error(`${file}: ${sql}: ${error.message}`);}count++;}
 }
 assert.ok(count>50);
});
test('SQL parameters and literals remain separate; filtering is case-insensitive',async()=>{
 assert.equal(compileSql("SELECT sourceRef FROM leads WHERE notes='What? sourceRef' AND id=?"),`SELECT "sourceRef" FROM leads WHERE notes='What? sourceRef' AND id=$1`);
 assert.equal((await db.prepare('SELECT id FROM leads WHERE owner=? AND name ILIKE ?').bind('owner-a','%ALICE%').all()).results.length,3);
});
test('Public API roles cannot access private app tables; resume bucket is private',async()=>{
 const tables=await pg.query("SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public'");assert.equal(tables.rows.length,14);assert.ok(tables.rows.every(r=>r.rowsecurity));
 await pg.exec('SET ROLE anon');await assert.rejects(pg.query('SELECT * FROM leads'),{code:'42501'});await pg.exec('RESET ROLE');
 await pg.exec('SET ROLE authenticated');await assert.rejects(pg.query('SELECT * FROM memberships'),{code:'42501'});await pg.exec('RESET ROLE');
 const {rows}=await pg.query("SELECT public,file_size_limit FROM storage.buckets WHERE id='resumes'");assert.equal(rows[0].public,false);assert.equal(Number(rows[0].file_size_limit),5000000);
});
test.after(()=>pg.close());
