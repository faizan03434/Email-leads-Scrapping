import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
test('Migration enforces tenant-scoped email uniqueness and campaign deduplication',()=>{
const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
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
test('Source identities deduplicate email-less leads; memberships and search leases remain durable',()=>{
const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const insert=db.prepare('INSERT INTO leads (id,owner,name,industry,source,sourceRef,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)');
insert.run('p1','a','Owner','Life Insurance','RentCast','property-1','','');
assert.throws(()=>insert.run('p2','a','Owner','Life Insurance','RentCast','property-1','',''),/UNIQUE/);
assert.doesNotThrow(()=>insert.run('p3','b','Owner','Life Insurance','RentCast','property-1','',''));
const member=db.prepare('INSERT INTO memberships (id,workspaceId,email,createdAt) VALUES (?,?,?,?)');member.run('m1','a','viewer@example.com','');assert.throws(()=>member.run('m2','a','viewer@example.com',''),/UNIQUE/);
db.prepare('INSERT INTO searchJobs (id,owner,provider,criteria,requested,nextRunAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)').run('j','a','rentcast','{}',100,'','','');
const lock=db.prepare("UPDATE searchJobs SET status='Running',leaseUntil=? WHERE id=? AND status IN ('Queued','Running','Retrying') AND leaseUntil<?");
assert.equal(lock.run(160000,'j',100000).changes,1);assert.equal(lock.run(160000,'j',100000).changes,0);assert.equal(lock.run(230000,'j',170000).changes,1);
db.prepare("UPDATE searchJobs SET status='Cancelled' WHERE id=?").run('j');assert.equal(lock.run(300000,'j',240000).changes,0);db.close();
});
test('Database batch transaction rolls back duplicate inbound event side effects',()=>{
const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));db.prepare('INSERT INTO events VALUES (?,?)').run('same-event','');
db.exec('BEGIN');try{db.prepare('INSERT INTO settings VALUES (?,?)').run('owner','{}');db.prepare('INSERT INTO events VALUES (?,?)').run('same-event','');db.exec('COMMIT');}catch{db.exec('ROLLBACK');}
assert.equal(db.prepare('SELECT COUNT(*) n FROM settings').get().n,0);db.close();
});
