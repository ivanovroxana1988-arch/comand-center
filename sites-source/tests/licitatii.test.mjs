import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {licitatiiService} from '../lib/licitatii/service.mjs';
import {taskService} from '../lib/command-center.mjs';
function setup(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO tenders (title,owner,created_at,updated_at) VALUES ('Test licitație','Roxana','2026-09-10','2026-09-10')");
  const db={prepare(sql){return {bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:sqlite.prepare(sql).run(...args)}),execute:()=>sqlite.prepare(sql).run(...args)}}}},async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)s.execute();sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
  return {db,service:licitatiiService(db,{id:'roxana'})};
}
test('company edits persist across sessions and reject stale writes',async()=>{
  const {db,service}=setup();
  const a=await service.create('companies',{name:'Companie test',cui:'RO123'});
  const b=await service.update('companies',a.id,a.version,{name:'Companie actualizată'});
  assert.equal((await licitatiiService(db,{id:'bogdan'}).get('companies',a.id)).name,b.name);
  await assert.rejects(service.update('companies',a.id,a.version,{name:'Scriere veche'}),/alt coleg/);
});
test('associations validate linked companies; tender filters isolate records',async()=>{
  const {service}=setup();
  await assert.rejects(service.create('associations',{name:'Invalid',leaderId:'missing'}),/nu există/);
  const company=await service.create('companies',{name:'Test',cui:'RO1'});
  await service.create('associations',{name:'Asociere',leaderId:company.id});
  await service.create('requirements',{tenderId:1,title:'CV semnat',category:'expert'});
  assert.equal((await service.list('requirements',{tenderId:1})).items.length,1);
  assert.equal((await service.list('requirements',{tenderId:2})).items.length,0);
});
test('invalid dates, scripts and unknown fields are rejected',async()=>{
  const {service}=setup();
  await assert.rejects(service.create('documents',{title:'CV',category:'expert',tenderId:1,url:'javascript:alert(1)'}),/HTTP/);
  await assert.rejects(service.create('documents',{title:'CV',category:'expert',tenderId:1,expiryDate:'2026-02-30'}),/Dată/);
  await assert.rejects(service.create('experts',{name:'Test',unknown:'x'}),/necunoscut/);
});
test('editing can clear optional references without keeping stale associations',async()=>{
  const {service}=setup();
  const company=await service.create('companies',{name:'Test',cui:'RO1'});
  const document=await service.create('documents',{title:'Document',category:'administrative',companyId:company.id,tenderId:1});
  const updated=await service.update('documents',document.id,document.version,{companyId:null});
  assert.equal(updated.companyId,undefined);
  assert.equal(updated.tenderId,1);
  await assert.rejects(service.update('documents',updated.id,updated.version,{tenderId:null}),/Leagă documentul/);
});
test('module proposes a linked task; only explicit approval creates it, once',async()=>{
  const {db,service}=setup();
  const req=await service.create('requirements',{tenderId:1,title:'Verificare CV',category:'expert'});
  const p=await service.proposeTask('requirements',req.id,{owner:'Bogdan'});
  const tasks=taskService(db,{id:'roxana',scopes:['tasks:read','tasks:write']});
  assert.equal((await tasks.list()).tasks.length,0);
  const receipt=await tasks.decide(p.proposal_id,true);
  assert.equal(receipt.task.tenderId,1);
  assert.equal(receipt.task.owner,'Bogdan');
  await tasks.decide(p.proposal_id,true);
  assert.equal((await tasks.list()).tasks.length,1);
});
test('expert forms persist, require complete answers and evaluate selected candidates',async()=>{
  const {db,service}=setup();
  const config={fields:[{id:'certificate',label:'Certificat',type:'checkbox',required:true}],factors:[],criteria:[{id:'eligible',label:'Certificat obligatoriu',source:{scope:'answer',key:'certificate'},operator:'eq',expected:true,sourceExcerpt:'Exemplu de test.'}],pricePoints:100,sourceExcerpt:'Exemplu de test: preț 100 puncte.'};
  const form=await service.create('configurations',{tenderId:1,title:'Formular test',config});
  const expert=await service.create('experts',{name:'Expert test'});
  const application=await service.create('applications',{tenderId:1,expertId:expert.id,role:'Expert',configurationId:form.id,selected:true});
  await assert.rejects(service.update('applications',application.id,application.version,{status:'finalizat'}),/Completează/);
  await service.update('applications',application.id,application.version,{status:'finalizat',answers:{certificate:true}});
  const result=await licitatiiService(db,{id:'bogdan'}).evaluate(form.id,{offer:100,lowest:80});
  assert.equal(result.configurationVersion,1);
  assert.equal(result.people.length,1);
  assert.equal(result.people[0].eligibility,'pass');
  assert.equal(result.readiness,'review');
  assert.equal(result.total,80);
});
test('expert applications cannot use a form belonging to another tender',async()=>{
  const {db,service}=setup();
  await db.prepare("INSERT INTO tenders (title,owner,created_at,updated_at) VALUES ('Altă licitație','Bogdan','2026-09-10','2026-09-10')").bind().run();
  const form=await service.create('configurations',{tenderId:1,title:'Formular',config:{fields:[],factors:[],criteria:[],pricePoints:100,sourceExcerpt:'Exemplu de test.'}});
  const expert=await service.create('experts',{name:'Expert test'});
  await assert.rejects(service.create('applications',{tenderId:2,expertId:expert.id,role:'Expert',configurationId:form.id}),/altei licitații/);
});
