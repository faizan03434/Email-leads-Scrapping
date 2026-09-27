import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,csvEscape,renderTemplate,normalizeImportedLead} from '../lib/domain.ts';
test('Optional blank import columns default safely without inventing a location',()=>{
 const row=normalizeImportedLead({name:'Alex',email:' ALEX@example.com ',industry:'',source:'',permission:''});
 assert.equal(row.state,'');assert.equal(row.email,'alex@example.com');assert.equal(row.permission,'Unknown');assert.equal(row.industry,'Life Insurance');assert.equal(row.source,'Manual entry');
});
test('CSV parser preserves quoted commas, newlines and escaped quotes',()=>{
 const records=parseCSV('\uFEFFname,email,notes\r\n"Doe, Jane",jane@example.com,"First line\nSaid ""yes"""\r\n');
 assert.deepEqual(records,[{name:'Doe, Jane',email:'jane@example.com',notes:'First line\nSaid "yes"'}]);
});
test('CSV parser rejects malformed quotes and missing required header',()=>{
 assert.throws(()=>parseCSV('name\n"broken'),/Unclosed/);
 assert.throws(()=>parseCSV('email\na@example.com'),/name column/);
});
test('Spreadsheet formula content is neutralized on export',()=>{
 for(const value of ['=1+1','+cmd','-1+2','@SUM(A1)','\t=SUM(A1)'])assert.ok(csvEscape(value).startsWith('"\''));
 assert.equal(csvEscape('a"b'),'"a""b"');
});
test('Personalization replaces only supported fields without evaluating content',()=>{
 assert.equal(renderTemplate('Hi {{name}} in {{city}}. {{unknown}}',{name:'Sam',city:'Austin'}),'Hi Sam in Austin. {{unknown}}');
 assert.equal(renderTemplate('{{name}}',{name:'<script>bad()</script>'}),'<script>bad()</script>');
});

import {allowedOrigin} from '../lib/request-origin.ts';
test('CSRF allows the configured public origin behind a proxy and rejects other origins',()=>{assert.equal(allowedOrigin('http://localhost:3000/api/auth','https://workspace.example','https://workspace.example'),true);assert.equal(allowedOrigin('http://localhost:3000/api/auth','https://evil.example','https://workspace.example'),false);assert.equal(allowedOrigin('https://preview.example/api/auth','https://preview.example',undefined),true);});
