import {ecosystem, canonicalArea} from './ecosystem.mjs';

export class OrganizationError extends Error {}
const fail=message=>{throw new OrganizationError(message)};
export const pageId=(area,title)=>`${canonicalArea(area)}::${title}`;
export const taskParent=t=>t.parent_task_id??t.parent_id??null;
export function defaultOrganization(){
 return {spaces:ecosystem.map(s=>({id:s.name,parent:null})),pages:ecosystem.flatMap(s=>s.topics.map(title=>({id:pageId(s.name,title),area:s.name,title,parent:null}))),taskOrder:[]};
}
function reconcile(document,tasks,pages){
 const d=structuredClone(document);
 for(const s of defaultOrganization().spaces)if(!d.spaces.some(n=>n.id===s.id))d.spaces.push(s);
 for(const p of [...defaultOrganization().pages,...pages.map(p=>({id:pageId(p.area,p.title),area:canonicalArea(p.area),title:p.title,parent:null})),...tasks.map(t=>({id:pageId(t.area,t.project),area:canonicalArea(t.area),title:t.project,parent:null}))]){
  if(!d.pages.some(n=>n.id===p.id||(n.area===p.area&&n.title===p.title)))d.pages.push(p);
 }
 d.taskOrder=d.taskOrder.filter(id=>tasks.some(t=>t.id===id));
 for(const t of tasks)if(!d.taskOrder.includes(t.id))d.taskOrder.push(t.id);
 return d;
}
function descendants(items,id,parent=x=>x.parent){
 const out=new Set([id]);let changed=true;
 while(changed){changed=false;for(const n of items)if(out.has(parent(n))&&!out.has(n.id)){out.add(n.id);changed=true}}
 return out;
}
function reposition(list,id,target,position){
 const from=list.findIndex(n=>(n.id??n)===id);const [item]=list.splice(from,1);
 let to=list.findIndex(n=>(n.id??n)===target);if(to<0)to=list.length;
 list.splice(to+(position==='after'?1:0),0,item);
}
const taskColumns=['area','project','parent_task_id','parent_id','tender_id','updated_at'];
export function organizationService(db,clock=()=>new Date()){
 const stmt=(sql,args=[])=>db.prepare(sql).bind(...args);
 const one=(sql,args=[])=>stmt(sql,args).first();
 const all=async(sql,args=[])=>((await stmt(sql,args).all()).results);
 async function load(){
  const row=await one('SELECT * FROM organization_state WHERE id=1');
  const tasks=await all('SELECT id,area,project,parent_task_id,parent_id,tender_id,updated_at,status FROM tasks ORDER BY id');
  const pages=await all('SELECT area,title FROM ecosystem_pages');
  return {revision:row?.revision??0,document:reconcile(row?JSON.parse(row.document):defaultOrganization(),tasks,pages),tasks};
 }
 const guard='EXISTS (SELECT 1 FROM organization_state WHERE id=1 AND revision=? AND last_change_id=?)';
 function taskConditions(){return `NOT EXISTS (SELECT 1 FROM json_each(?) snapshot LEFT JOIN tasks t ON t.id=json_extract(snapshot.value,'$.id') WHERE t.id IS NULL OR NOT (${taskColumns.map(c=>`t.${c} IS json_extract(snapshot.value,'$.${c}')`).join(' AND ')}))`}
 const taskArgs=rows=>rows.length?[JSON.stringify(rows)]:[];
 async function commit(before,document,beforeTasks,afterTasks){
  const id=crypto.randomUUID(),now=clock().toISOString(),revision=before.revision+1;
  await stmt('INSERT OR IGNORE INTO organization_state(id,revision,document,updated_at) VALUES(1,0,?,?)',[JSON.stringify(defaultOrganization()),now]).run();
  const claim=stmt(`UPDATE organization_state SET document=?,revision=?,last_change_id=?,updated_at=? WHERE id=1 AND revision=?${beforeTasks.length?' AND '+taskConditions(beforeTasks):''}`,[JSON.stringify(document),revision,id,now,before.revision,...taskArgs(beforeTasks)]);
  const mutations=afterTasks.length?[stmt(`UPDATE tasks SET ${taskColumns.map(c=>`${c}=(SELECT json_extract(value,'$.${c}') FROM json_each(?) WHERE json_extract(value,'$.id')=tasks.id)`).join(',')} WHERE id IN (SELECT json_extract(value,'$.id') FROM json_each(?)) AND ${guard}`,[...taskColumns.map(()=>JSON.stringify(afterTasks)),JSON.stringify(afterTasks),revision,id])]:[];
  const receipt=stmt(`INSERT INTO organization_changes(id,before_document,after_revision,before_tasks,after_tasks,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,[id,JSON.stringify(before.document),revision,JSON.stringify(beforeTasks),JSON.stringify(afterTasks),now,revision,id]);
  await db.batch([claim,...mutations,receipt]);
  if(!await one('SELECT id FROM organization_changes WHERE id=?',[id]))fail('Organizarea s-a schimbat. Reîncarcă lista și încearcă din nou.');
  return {...await load(),undoId:id};
 }
 return {
  get:load,
  async move(input){
   if(!input||typeof input!=='object'||!Number.isInteger(input.revision))fail('Mutare invalidă.');
   const before=await load();if(before.revision!==input.revision)fail('Organizarea s-a schimbat. Reîncarcă lista și încearcă din nou.');
   const d=structuredClone(before.document),now=clock().toISOString();let oldTasks=[],newTasks=[];
   const position=input.position??'inside';if(!['inside','before','after'].includes(position))fail('Poziție invalidă.');
   if(input.kind==='space'){
    const item=d.spaces.find(n=>n.id===input.id),target=d.spaces.find(n=>n.id===input.target);
    if(!item||(!target&&input.target!==null)||item.id===target?.id)fail('Spațiu invalid.');
    const parent=position==='inside'?target?.id??null:target?.parent??null;
    if(descendants(d.spaces,item.id).has(parent))fail('Un spațiu nu poate fi mutat în propria subcomponentă.');
    item.parent=parent;reposition(d.spaces,item.id,target?.id,position);
   }else if(input.kind==='page'){
    if(!['page','space'].includes(input.targetKind))fail('Destinație invalidă.');
    const item=d.pages.find(n=>n.id===input.id);if(!item)fail('Pagina nu există.');
    const target=input.targetKind==='page'?d.pages.find(n=>n.id===input.target):d.spaces.find(n=>n.id===input.target);
    if(!target||item.id===target.id)fail('Destinație invalidă.');
    const group=descendants(d.pages,item.id);
    const parent=input.targetKind==='page'?(position==='inside'?target.id:target.parent):null;
    if(group.has(parent))fail('O pagină nu poate fi mutată în propria subcomponentă.');
    const area=input.targetKind==='page'?target.area:target.id;
    const moved=d.pages.filter(p=>group.has(p.id));
    if(moved.some(p=>d.pages.some(n=>!group.has(n.id)&&n.area===area&&n.title===p.title)))fail('Destinația are deja o pagină cu același nume. Alege alt spațiu.');
    const matches=t=>moved.some(p=>canonicalArea(t.area)===p.area&&t.project===p.title);
    oldTasks=before.tasks.filter(matches);
    if(oldTasks.some(t=>t.tender_id)&&area!=='Tenders & Procurement Ro')fail('Taskurile legate de o licitație trebuie să rămână în Tenders & Procurement Ro.');
    newTasks=oldTasks.map(t=>({...t,area,updated_at:now}));
    for(const p of moved)p.area=area;item.parent=parent;
    if(input.targetKind==='page')reposition(d.pages,item.id,target.id,position);
   }else if(input.kind==='task'){
    const item=before.tasks.find(t=>t.id===input.id);if(!item)fail('Taskul nu există.');
    const group=descendants(before.tasks,item.id,taskParent);
    let area=canonicalArea(item.area),project=item.project,parent=null,tenderId=item.tender_id;
    if(input.targetKind==='task'){
     const target=before.tasks.find(t=>t.id===input.target);if(!target||group.has(target.id))fail('Un task nu poate fi mutat în el însuși sau în propriile subtaskuri.');
     area=canonicalArea(target.area);project=target.project;parent=position==='inside'?target.id:taskParent(target);
     if(parent&&group.has(parent))fail('Mutarea ar crea o buclă.');
     const parentTask=parent?before.tasks.find(t=>t.id===parent):null;
     if(parentTask?.status==='Finalizat'&&before.tasks.some(t=>group.has(t.id)&&t.status!=='Finalizat'))fail('Redeschide taskul părinte înainte de a adăuga subtaskuri active.');
     if(item.tender_id&&target.tender_id&&item.tender_id!==target.tender_id)fail('Taskurile aparțin unor licitații diferite.');
     if(parent)tenderId=target.tender_id??item.tender_id;
     reposition(d.taskOrder,item.id,target.id,position);
    }else if(input.targetKind==='page'){
     const target=d.pages.find(p=>p.id===input.target);if(!target)fail('Pagina nu există.');area=target.area;project=target.title;
    }else if(input.targetKind==='space'){
     if(!d.spaces.some(s=>s.id===input.target))fail('Spațiul nu există.');area=input.target;
    }else fail('Destinație invalidă.');
    oldTasks=before.tasks.filter(t=>group.has(t.id));
    if(oldTasks.some(t=>t.tender_id)&&area!=='Tenders & Procurement Ro')fail('Taskurile legate de o licitație trebuie să rămână în Tenders & Procurement Ro.');
    if(tenderId&&oldTasks.some(t=>t.tender_id&&t.tender_id!==tenderId))fail('Subtaskurile aparțin unor licitații diferite.');
    newTasks=oldTasks.map(t=>({...t,area,project,tender_id:t.tender_id??tenderId,parent_task_id:t.id===item.id?parent:taskParent(t),parent_id:null,updated_at:now}));
   }else if(input.kind==='create_page'){
    const title=typeof input.title==='string'?input.title.trim():'';
    if(!title||title.length>120||!d.spaces.some(s=>s.id===input.area))fail('Indică spațiul și un nume de maximum 120 de caractere.');
    if(d.pages.some(p=>p.area===input.area&&p.title===title))fail('Pagina există deja.');
    d.pages.push({id:crypto.randomUUID(),area:input.area,title,parent:null});
   }else fail('Tip de mutare invalid.');
   return commit(before,d,oldTasks,newTasks);
  },
  async undo(input){
   const receipt=await one('SELECT * FROM organization_changes WHERE id=?',[input?.undoId]);
   if(!receipt||receipt.undone)fail('Mutarea nu mai poate fi anulată.');
   const current=await load();if(current.revision!==receipt.after_revision||input.revision!==current.revision)fail('Organizarea s-a schimbat între timp. Nu putem anula peste modificările altcuiva.');
   const expected=JSON.parse(receipt.after_tasks),restore=JSON.parse(receipt.before_tasks).map(t=>({...t,updated_at:clock().toISOString()}));
   const result=await commit(current,JSON.parse(receipt.before_document),expected,restore);
   await stmt('UPDATE organization_changes SET undone=1 WHERE id=?',[receipt.id]).run();
   return {...result,undoId:null};
  }
 };
}
