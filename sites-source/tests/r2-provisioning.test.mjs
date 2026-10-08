import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureBucket} from '../scripts/ensure-r2.mjs';
test('reuses the explicitly named bucket on repeated deployments',()=>{
 const calls=[];
 assert.equal(ensureBucket('comand-center-attachments',args=>{calls.push(args);return 'name:           comand-center-attachments\ncreation_date:  now\n'}),'existing');
 assert.equal(calls.length,1);
});
test('creates only the missing attachment bucket',()=>{
 const calls=[];
 assert.equal(ensureBucket('comand-center-attachments',args=>{calls.push(args);return 'name: another-bucket\ncreation_date: now\n'}),'created');
 assert.deepEqual(calls[1],['r2','bucket','create','comand-center-attachments']);
});
test('failed listing does not attempt resource creation',()=>{
 let calls=0;
 assert.throws(()=>ensureBucket('comand-center-attachments',()=>{calls++;throw new Error('Not authorized')}),/Not authorized/);
 assert.equal(calls,1);
});
