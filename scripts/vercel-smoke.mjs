import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base='http://127.0.0.1:3187';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3187'],{stdio:'pipe',windowsHide:true,env:{...process.env,APP_URL:base,LIVE_SEND_ENABLED:'false'}});
let browser;server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});
async function workspace(extra={}){const response=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...extra},body:JSON.stringify({action:'list',data:{}})});assert.equal(response.status,200);return response.json();}
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base,{redirect:'manual'})).status===200){ready=true;break;}}catch{}await delay(500);}assert.ok(ready);
 const legacy=await fetch(base+'/login',{redirect:'manual'});assert.equal(legacy.headers.get('location'),'/');
 const first=await workspace(),second=await workspace({Cookie:'leadflow-workspace=unrelated; leadflow-admin=invalid','oai-authenticated-user-id':'other-user'});assert.equal(first.access.workspaceId,second.access.workspaceId);
 const setup=await fetch(base+'/api/setup');assert.equal(setup.status,200);const settings=await setup.json();for(const group of settings.groups)for(const field of group.fields)if(field.secret)assert.equal(field.value,'');
 const invalid=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'test',group:'supabase',values:{DATABASE_URL:'postgresql://postgres:secret@localhost:5432/postgres'}})});assert.equal(invalid.status,400);
 const csrf=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://unrelated.example'},body:'{"action":"save"}'});assert.equal(csrf.status,403);
 for(const method of ['GET','POST'])assert.equal((await fetch(base+'/api/automation',{method})).status,401);
 assert.equal((await fetch(base+'/api/auth')).status,404);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('heading',{name:'Lead workspace',exact:true}).waitFor();assert.equal(await page.getByText('Sign out',{exact:true}).count(),0);
 await page.goto(base+'/setup');await page.getByRole('heading',{name:'Supabase connection',exact:true}).waitFor();assert.equal(await page.getByText('Administrator login',{exact:true}).count(),0);assert.equal(await page.getByText('Current admin password (required to switch)',{exact:true}).count(),0);
 fs.mkdirSync('work/qa',{recursive:true});for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`work/qa/shared-setup-${width}.png`,fullPage:true});}assert.deepEqual(errors,[]);
 console.log('Passed: no-login dashboard and setup, stable shared workspace, masked secrets, no password fields, legacy redirect, CSRF, scheduler authentication and mobile layout. No emails or paid provider searches.');
}finally{await browser?.close();server.kill();}
