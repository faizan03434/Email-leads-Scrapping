import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('Migration enforces tenant-scoped email uniqueness and campaign deduplication',()=>{
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('drizzle/0000_perpetual_sentry.sql','utf8'));
const lead=db.prepare('INSERT INTO leads (id,owner,name,email,industry,source,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)');
lead.run('a','owner-a','Alice','alice@example.com','Life Insurance','Test','2026-09-26','2026-09-26');
assert.throws(()=>lead.run('b','owner-a','Alice','alice@example.com','Life Insurance','Test','',''),/UNIQUE/);
assert.doesNotThrow(()=>lead.run('c','owner-b','Alice','alice@example.com','Life Insurance','Test','',''));
assert.doesNotThrow(()=>lead.run('d','owner-a','No email',null,'Life Insurance','Test','',''));
assert.doesNotThrow(()=>lead.run('e','owner-a','No email either',null,'Life Insurance','Test','',''));
db.prepare('INSERT INTO campaigns (id,owner,name,industry,subject,body,createdAt) VALUES (?,?,?,?,?,?,?)').run('campaign','owner-a','Test','Life Insurance','Hello','Hello','');
const enroll=db.prepare('INSERT INTO deliveries (id,owner,campaignId,leadId,createdAt) VALUES (?,?,?,?,?)');enroll.run('delivery','owner-a','campaign','a','');
assert.throws(()=>enroll.run('delivery2','owner-a','campaign','a',''),/UNIQUE/);
assert.equal(db.prepare('SELECT COUNT(*) n FROM leads WHERE owner=?').get('owner-b').n,1);
db.close();
});
test('Database batch transaction rolls back duplicate inbound event side effects',()=>{
const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('drizzle/0000_perpetual_sentry.sql','utf8'));db.prepare('INSERT INTO events VALUES (?,?)').run('same-event','');
db.exec('BEGIN');try{db.prepare('INSERT INTO settings VALUES (?,?)').run('owner','{}');db.prepare('INSERT INTO events VALUES (?,?)').run('same-event','');db.exec('COMMIT');}catch{db.exec('ROLLBACK');}
assert.equal(db.prepare('SELECT COUNT(*) n FROM settings').get().n,0);db.close();
});
