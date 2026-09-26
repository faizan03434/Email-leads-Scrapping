import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProperties,mapJobs,fetchProviderPage,ProviderError,stateCode} from '../lib/providers.ts';
import {permissionError} from '../lib/permissions.ts';
const criteria={industry:'Life Insurance',state:'Texas',city:'Austin',type:'Property owner',query:'',limit:100,provider:'rentcast'};
test('RentCast uses requested state and preserves real source identity without inventing contacts',async()=>{
 let requested;const fetcher=async(url)=>{requested=new URL(url);return Response.json([{id:'property-1',addressLine1:'Test street',state:'TX',city:'Austin',owner:{names:['Example Owner']}}]);};
 const page=await fetchProviderPage({RENTCAST_API_KEY:'test-key'},criteria,'50',100,fetcher);
 assert.equal(requested.searchParams.get('state'),'TX');assert.equal(requested.searchParams.get('offset'),'50');assert.equal(page.leads[0].email,'');assert.equal(page.leads[0].permission,'Unknown');assert.equal(page.leads[0].type,'Property owner');assert.equal(page.leads[0].sourceRef,'property-1');assert.equal(stateCode('New Jersey'),'NJ');
});
test('Adzuna jobs are never mapped to candidate profiles or inferred email addresses',()=>{
 const rows=mapJobs([{id:123,title:'Recruiter',company:{display_name:'Example Co'},location:{area:['US','Texas','Austin'],display_name:'Austin, TX'},redirect_url:'https://example.com/job/123'}],{...criteria,provider:'adzuna',type:'Job opening'});
 assert.equal(rows[0].type,'Job opening');assert.equal(rows[0].email,'');assert.equal(rows[0].jobTitle,'Recruiter');assert.equal(rows[0].state,'Texas');
});
test('Provider rejects incompatible data types and honors retry-after without leaking key',async()=>{
 await assert.rejects(fetchProviderPage({RENTCAST_API_KEY:'secret'}, {...criteria,type:'Candidate'},'',50),/does not supply/);
 await assert.rejects(fetchProviderPage({RENTCAST_API_KEY:'secret'},criteria,'',50,async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})),e=>e instanceof ProviderError&&e.retryable&&e.retryAfter===120&&!e.message.includes('secret'));
});
test('Missing source fields remain empty rather than inheriting a requested location',()=>{
 const rows=mapProperties([{id:'unknown-location'}],criteria);assert.equal(rows[0].state,'');assert.equal(rows[0].city,'');
});
test('Roles enforce read-only and administrator boundaries on the server',()=>{
 assert.equal(permissionError('viewer','list'),null);assert.ok(permissionError('viewer','saveLead'));assert.ok(permissionError('member','saveMember'));assert.ok(permissionError('member','saveSettings'));assert.equal(permissionError('admin','saveMember'),null);assert.equal(permissionError('member','generate'),null);
});
