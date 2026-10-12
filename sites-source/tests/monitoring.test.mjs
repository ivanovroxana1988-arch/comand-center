import test from 'node:test';
import assert from 'node:assert/strict';
import {todayGroups,teamGroups} from '../lib/monitoring.mjs';
const task=(id,owner,extra={})=>({id,owner,title:'Task',status:'De făcut',dueDate:null,priority:'Medie',...extra});
test('Azi uses the logged-in owner, includes shared tasks, and excludes completed or other-owner tasks',()=>{
 const tasks=[task(1,'Roxana'),task(2,'Bogdan'),task(3,'Împreună'),task(4,'Roxana',{status:'Finalizat'})];
 assert.deepEqual(todayGroups(tasks,'Roxana','2026-10-12').mine.map(t=>t.id),[1,3]);
 assert.deepEqual(todayGroups(tasks,'Bogdan','2026-10-12').mine.map(t=>t.id),[2,3]);
 assert.deepEqual(todayGroups(tasks,'','2026-10-12'),{mine:[],waiting:[],late:[]});
});
test('follow-ups appear with waiting tasks; overdue takes precedence and no task appears twice',()=>{
 const tasks=[task(1,'Roxana',{title:'Follow-up Colliers'}),task(2,'Roxana',{status:'Așteptăm'}),task(3,'Roxana',{title:'Follow-up',dueDate:'2026-10-11'}),task(4,'Roxana',{dueDate:'2026-10-12'}),task(5,'Roxana',{dueDate:'2026-10-30'})];
 const groups=todayGroups(tasks,'Roxana','2026-10-12');
 assert.deepEqual(groups.waiting.map(t=>t.id),[1,2]);assert.deepEqual(groups.late.map(t=>t.id),[3]);assert.deepEqual(groups.mine.map(t=>t.id),[4,5]);
 assert.equal(new Set(Object.values(groups).flat().map(t=>t.id)).size,tasks.length);
});
test('Echipa shows each shared task only once and retains a group for both people',()=>{
 const groups=teamGroups([task(1,'Roxana'),task(2,'Împreună'),task(3,'Bogdan',{status:'Finalizat'})]);
 assert.deepEqual(groups.map(g=>[g.owner,g.tasks.map(t=>t.id)]),[['Roxana',[1]],['Bogdan',[]],['Împreună',[2]]]);
});
