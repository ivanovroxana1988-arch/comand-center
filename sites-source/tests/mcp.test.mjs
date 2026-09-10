import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {taskService,validateTask} from '../lib/command-center.mjs';
import {mcpResponse} from '../lib/mcp-transport.mjs';
function setup() {
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>sqlite.prepare(sql).run(...args),execute:()=>sqlite.prepare(sql).run(...args)}}}},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)s.execute();sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  let time=new Date('2026-09-10T12:00:00.000Z');
  const user={id:'roxana',scopes:['tasks:read','tasks:write']};
  return {sqlite,db,user,service:taskService(db,user,()=>time),advance:()=>{time=new Date(time.getTime()+16*60*1000)}};
}
const input={area:'Licitații',project:'Test izolat',title:'Verifică dosarul',owner:'Roxana'};
test('proposals do not write tasks; approval is idempotent and survives service restart',async()=>{
  const {service,db,user}=setup(); const p=await service.propose('create_task',input);
  assert.equal((await service.list()).tasks.length,0);
  const first=await service.decide(p.proposal_id,true); assert.equal(first.task.title,input.title);
  const restarted=taskService(db,user,()=>new Date('2026-09-10T12:00:00Z'));
  assert.deepEqual(await restarted.decide(p.proposal_id,true),first);
  assert.equal((await service.list()).tasks.length,1);
});
test('cancellation and expiry prevent changes',async()=>{
  const {service,advance}=setup(); const p=await service.propose('create_task',input);
  assert.equal((await service.decide(p.proposal_id,false)).status,'cancelled');
  await assert.rejects(service.decide(p.proposal_id,true));
  const expired=await service.propose('create_task',input);advance();
  await assert.rejects(service.decide(expired.proposal_id,true),/expirat/);
  assert.equal((await service.list()).tasks.length,0);
});
test('read-only principals cannot propose or approve; another principal cannot approve',async()=>{
  const {service,db}=setup();const p=await service.propose('create_task',input);
  const reader=taskService(db,{id:'roxana',scopes:['tasks:read']});
  await assert.rejects(reader.propose('create_task',input),/neautorizat/);
  await assert.rejects(reader.decide(p.proposal_id,true),/neautorizat/);
  const other=taskService(db,{id:'bogdan',scopes:['tasks:read','tasks:write']});
  await assert.rejects(other.decide(p.proposal_id,true),/aparține/);
});
test('subtasks inherit project; parents cannot complete until children finish',async()=>{
  const {service}=setup();const parent=await service.decide((await service.propose('create_task',input)).proposal_id,true);
  const child=await service.decide((await service.propose('create_subtask',{parent_task_id:parent.task.id,title:'Anexe'})).proposal_id,true);
  assert.equal(child.task.parent_task_id,parent.task.id);assert.equal(child.task.project,input.project);
  await assert.rejects(service.propose('complete_task',{id:parent.task.id}),/subtaskurile/);
  await service.decide((await service.propose('complete_task',{id:child.task.id})).proposal_id,true);
  const done=await service.decide((await service.propose('complete_task',{id:parent.task.id})).proposal_id,true);
  assert.equal(done.task.status,'Finalizat');
});
test('stale proposals cannot overwrite another edit, even at the same timestamp',async()=>{
  const {service}=setup();const created=await service.decide((await service.propose('create_task',input)).proposal_id,true);
  const a=await service.propose('update_task',{id:created.task.id,title:'A'});
  const b=await service.propose('update_task',{id:created.task.id,title:'B'});
  await service.decide(a.proposal_id,true);
  await assert.rejects(service.decide(b.proposal_id,true),/schimbat/);
  assert.equal((await service.get(created.task.id)).title,'A');
});
test('validation rejects invalid dates, scripts, unknown fields and missing parents',async()=>{
  const {service}=setup();
  assert.throws(()=>validateTask({...input,dueDate:'2026-02-30'}));
  assert.throws(()=>validateTask({...input,link:'javascript:alert(1)'}));
  assert.throws(()=>validateTask({...input,sql:'DROP TABLE tasks'}));
  await assert.rejects(service.propose('create_subtask',{title:'No parent',parent_task_id:999}));
});
test('MCP exposes tools and proposals but never an approval tool',async()=>{
  const {service}=setup();const origin='https://example.test';
  const call=async(method,params)=> (await mcpResponse(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),service,origin)).json();
  assert.equal((await call('initialize',{protocolVersion:'2025-06-18'})).result.protocolVersion,'2025-06-18');
  const listed=(await call('tools/list')).result.tools;
  assert.equal(listed.length,7);assert.ok(!listed.some(t=>/approve|decide|commit/.test(t.name)));
  const p=(await call('tools/call',{name:'create_task',arguments:input})).result.structuredContent;
  assert.equal(p.status,'pending');assert.match(p.confirmation_url,/confirm-change/);
  assert.equal((await service.list()).tasks.length,0);
  assert.equal((await call('tools/call',{name:'approve',arguments:{}})).error.code,-32602);
});
