import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifySendGrid} from '../lib/sendgrid-security.ts';
test('SendGrid signatures reject tampered content, stale timestamps and wrong keys',()=>{
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const key=publicKey.export({format:'der',type:'spki'}).toString('base64');const body=Buffer.from('[{"event":"delivered"}]');const stamp=String(Math.floor(Date.now()/1000));const sig=sign('sha256',Buffer.concat([Buffer.from(stamp),body]),privateKey).toString('base64');
assert.equal(verifySendGrid(body,stamp,sig,key),true);assert.equal(verifySendGrid(Buffer.from('tampered'),stamp,sig,key),false);assert.equal(verifySendGrid(body,'1',sig,key),false);assert.equal(verifySendGrid(body,stamp,sig,'invalid'),false);
});
