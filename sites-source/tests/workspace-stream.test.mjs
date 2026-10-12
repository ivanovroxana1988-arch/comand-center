import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {workspaceStream} from '../lib/workspace-stream.mjs';
const decode=chunk=>new TextDecoder().decode(chunk.value);
test('streams changed revisions and keeps unchanged revisions as heartbeats',async()=>{
 let revision=10;
 const response=workspaceStream({authorized:async()=>true,readRevision:async()=>revision,interval:1});
 assert.match(response.headers.get('content-type'),/text\/event-stream/);
 assert.match(response.headers.get('cache-control'),/no-store/);
 const reader=response.body.getReader();
 assert.match(decode(await reader.read()),/event: workspace\ndata: {"revision":10}/);
 assert.equal(decode(await reader.read()),': heartbeat\n\n');
 revision=11;
 let found=false;
 for(let i=0;i<3;i++)if(decode(await reader.read()).includes('"revision":11')){found=true;break}
 assert.ok(found);await reader.cancel();
});
test('missing or revoked sessions close the stream without returning task data',async()=>{
 let authorized=false,reads=0;
 const response=workspaceStream({authorized:async()=>authorized,readRevision:async()=>{reads++;return 1},interval:1});
 const reader=response.body.getReader();
 assert.match(decode(await reader.read()),/event: auth-expired/);
 assert.ok((await reader.read()).done);assert.equal(reads,0);
 authorized=true;
 const live=workspaceStream({authorized:async()=>authorized,readRevision:async()=>1,interval:1}).body.getReader();
 await live.read();authorized=false;
 let expired=false;
 for(let i=0;i<3;i++){const chunk=await live.read();if(chunk.done)break;if(decode(chunk).includes('auth-expired')){expired=true;break}}
 assert.ok(expired);await live.cancel();
});
test('same-timestamp edits and deletions increment a durable revision',()=>{
 const db=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const revision=()=>db.prepare('SELECT revision FROM workspace_revision WHERE id=1').get()?.revision??0;
 assert.equal(revision(),0);
 db.exec("INSERT INTO tasks(area,project,title,owner,created_at,updated_at) VALUES('ONG','Test','One','Roxana','same','same')");
 assert.equal(revision(),1);
 db.exec("UPDATE tasks SET title='Two' WHERE id=1");assert.equal(revision(),2);
 db.exec("UPDATE tasks SET status='În lucru' WHERE id=1");assert.equal(revision(),3);
 db.exec('DELETE FROM tasks WHERE id=1');assert.equal(revision(),4);
 db.exec("INSERT INTO ecosystem_pages(area,title,created_at) VALUES('Sales, Partnerships & Pitches','Client','now')");assert.equal(revision(),5);
});
