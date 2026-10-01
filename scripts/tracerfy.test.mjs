import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {createDatabase} from '../db/adapter.ts';
import {advancedTraceBody,traceContact,traceIdentity,tracerfyRequest,traceRow} from '../lib/tracerfy.ts';
import {validatedChanges} from '../lib/setup/validation.ts';
import {z} from 'zod';
test('Tracerfy uses advanced batch, real state codes and validates contacts',async()=>{
 const body=advancedTraceBody([{address:'12 Main St',city:'Austin',state:'Texas',zip:'78701'}]);
 assert.equal(body.trace_type,'advanced');assert.equal(JSON.parse(body.json_data)[0].state,'TX');
 assert.equal(traceIdentity({address:' 12 Main St ',city:'Austin',state:'Texas'}),traceIdentity({address:'12 main st',city:'austin',state:'TX'}));
 assert.deepEqual(traceContact({email_1:'invalid',email_2:'VALID@example.com',primary_phone:'5125550100'}),{email:'valid@example.com',phone:'5125550100'});
 let request;await tracerfyRequest('secret','trace/',body,async(url,init)=>{request={url,init};return Response.json({queue_id:123});});
 assert.equal(request.url,'https://tracerfy.com/v1/api/trace/');assert.equal(request.init.headers.Authorization,'Bearer secret');
 await assert.rejects(tracerfyRequest('secret','trace/',body,async()=>new Response('private provider details',{status:402})),/credits are insufficient/);
 assert.deepEqual(validatedChanges('tracerfy',{TRACERFY_API_KEY:'test'}),{TRACERFY_API_KEY:'test'});assert.throws(()=>validatedChanges('tracerfy',{BATCHDATA_API_KEY:'test'}));
});
test('Durable batch flow avoids duplicate submissions, matches reordered results, preserves tenant and permission, and saves phone-only results',async()=>{
 const pg=new PGlite();try{
 await pg.exec('CREATE TABLE "sendLocks"(owner text primary key,"expiresAt" bigint,token text); CREATE TABLE leads(id text primary key,owner text,name text,type text,email text,phone text default \'\',address text,city text,state text,zip text,status text,permission text,"createdAt" text,"updatedAt" text); CREATE UNIQUE INDEX email_owner ON leads(owner,email);');
 const executor=async(sql,values)=>{const r=await pg.query(sql,values);return {rows:r.rows,count:r.affectedRows??r.rows.length};};const database=createDatabase(executor);
 for(const [id,address,owner] of [['a','12 Main St','one'],['b','13 Main St','one'],['c','14 Main St','one'],['d','15 Main St','one'],['other','12 Main St','two']])await pg.query('INSERT INTO leads VALUES ($1,$2,\'Property owner\',\'Property owner\',NULL,\'\',$3,\'Austin\',\'Texas\',\'78701\',\'New\',\'Unknown\',\'\',\'\')',[id,owner,address]);
 let saved=null,pending=true,submissions=0;const clone=v=>structuredClone(v);
 const deps={z,db:()=>database,runtime:async()=>({TRACERFY_API_KEY:'test'}),now:()=>new Date().toISOString(),HttpError:class extends Error{constructor(status,message){super(message);this.status=status;}},readSetting:async()=>clone(saved),writeSetting:async(_key,value)=>{saved=clone(value);},advancedTraceBody,traceRow,traceContact,traceIdentity,tracerfyRequest:async(_key,path,body)=>{if(path==='trace/'){submissions++;assert.equal(body.trace_type,'advanced');return {queue_id:42};}if(path.startsWith('queues/'))return [{id:42,pending}];return [{address:'15 Main St',city:'Austin',state:'TX',email_1:'wrong1@example.com'},{address:'15 Main St',city:'Austin',state:'TX',email_1:'wrong2@example.com'},{address:'13 Main St',city:'Austin',state:'TX',primary_phone:'5125550100'},{address:'12 Main St',city:'Austin',state:'TX',email_1:'alice@example.com'}];}};
 globalThis.__tracerfyTest=deps;
 const source=fs.readFileSync('lib/enrichment.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 const output=ts.transpileModule('const {z,db,runtime,now,HttpError,readSetting,writeSetting,advancedTraceBody,tracerfyRequest,traceRow,traceContact,traceIdentity}=globalThis.__tracerfyTest;\n'+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const {enrichLeads}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
 assert.equal((await enrichLeads('one')).pending,true);assert.equal(submissions,1);
 assert.equal((await enrichLeads('one')).pending,true);assert.equal(submissions,1);
 pending=false;const result=await enrichLeads('one');assert.equal(result.matched,1);assert.equal(result.phones,1);
 const {rows}=await pg.query('SELECT * FROM leads ORDER BY id');assert.equal(rows[0].email,'alice@example.com');assert.equal(rows[0].permission,'Unknown');assert.equal(rows[1].email,null);assert.equal(rows[1].phone,'5125550100');assert.equal(rows[2].email,null);assert.equal(rows[3].email,null);assert.equal(rows[4].email,null);
 await enrichLeads('one');assert.equal(submissions,1);
 saved={attempted:[],job:{status:'submitting',targets:[]}};await assert.rejects(enrichLeads('one'),/uncertain outcome/);assert.equal(submissions,1);
 }finally{delete globalThis.__tracerfyTest;await pg.close();}
});
