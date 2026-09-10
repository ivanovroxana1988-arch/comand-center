// Storage-independent task operations. D1 and the SQLite test adapter share this API.
export const areas = ['Licitații', 'Personal Brand Bogdan', 'ONG', 'After School', 'Visceral'];
export const owners = ['Roxana', 'Bogdan', 'Împreună'];
export const statuses = ['De făcut', 'În lucru', 'Așteptăm', 'Blocat', 'Finalizat'];
export const priorities = ['Urgentă', 'Ridicată', 'Medie', 'Scăzută'];
const columns = { area:'area', project:'project', title:'title', owner:'owner', dueDate:'due_date', status:'status', priority:'priority', nextStep:'next_step', link:'link', notes:'notes', parent_task_id:'parent_task_id' };
const selection = `id, area, project, title, owner, due_date AS dueDate, status, priority, next_step AS nextStep, link, notes, parent_task_id, created_at AS createdAt, updated_at AS updatedAt`;
export class TaskError extends Error {}
const fail = message => { throw new TaskError(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function positiveId(value) { if (!Number.isSafeInteger(value) || value < 1) fail('ID invalid.'); return value; }
function text(value, max, required=false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Text lipsă sau prea lung.');
  return value.trim();
}
export function validateTask(input, partial=false) {
  if (!object(input)) fail('Date invalide.');
  const out={};
  for (const [key,value] of Object.entries(input)) {
    if (!(key in columns)) fail(`Câmp necunoscut: ${key}`);
    if (key==='parent_task_id') { out[key]=value===null?null:positiveId(value); continue; }
    if (key==='dueDate') {
      if (value===null || value==='') { out[key]=null; continue; }
      if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) fail('Data trebuie să fie validă, în format YYYY-MM-DD.');
      out[key]=value; continue;
    }
    out[key]=text(value, {title:240,project:120,notes:2000,link:2000}[key] || 500, ['title','project','area','owner','status','priority'].includes(key));
    const choices={area:areas,owner:owners,status:statuses,priority:priorities}[key];
    if (choices && !choices.includes(out[key])) fail(`Valoare invalidă: ${key}`);
    if (key==='link' && out[key]) { let u; try { u=new URL(out[key]); } catch { fail('Link invalid.'); } if(!['https:','http:'].includes(u.protocol)) fail('Linkul trebuie să fie HTTP/HTTPS.'); }
  }
  if(!partial) {
    for(const key of ['area','project','title','owner']) if(!out[key]) fail(`Câmp obligatoriu: ${key}`);
    return {status:'De făcut',priority:'Medie',dueDate:null,nextStep:'',link:'',notes:'',parent_task_id:null,...out};
  }
  if('parent_task_id' in out) fail('Mutarea unui task sub alt părinte nu este permisă.');
  if(!Object.keys(out).length) fail('Nu ai indicat nicio modificare.');
  return out;
}
export function taskService(db, user, clock=()=>new Date()) {
  // user must be produced by the trusted authentication adapter, never request JSON.
  if(!user?.id || !user.scopes?.includes('tasks:read')) fail('Acces de citire neautorizat.');
  const stmt=(sql,params=[])=>db.prepare(sql).bind(...params);
  const one=(sql,params=[])=>stmt(sql,params).first();
  const write=()=>{if(!user.scopes.includes('tasks:write')) fail('Acces de scriere neautorizat.');};
  const get=async id=>{const row=await one(`SELECT ${selection} FROM tasks WHERE id=?`,[positiveId(id)]); if(!row) fail('Taskul nu există.'); return row;};
  return {
    get,
    async list(filters={}) {
      if(!object(filters)) fail('Filtre invalide.');
      const where=[], args=[];
      for(const [key,value] of Object.entries(filters)) {
        if(['area','owner','status','project','parent_task_id'].includes(key)) {
          if(key==='parent_task_id') positiveId(value); else text(value,120,true);
          where.push(`${columns[key]}=?`); args.push(value);
        } else if(!['limit','offset'].includes(key)) fail('Filtru necunoscut.');
      }
      const limit=filters.limit??50, offset=filters.offset??0;
      if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0) fail('Paginare invalidă.');
      const result=await stmt(`SELECT ${selection} FROM tasks ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY id LIMIT ? OFFSET ?`,[...args,limit+1,offset]).all();
      return {tasks:result.results.slice(0,limit),next_offset:result.results.length>limit?offset+limit:null};
    },
    async propose(operation, input) {
      write(); if(!object(input)) fail('Date invalide.');
      let changes,before=null,taskId=null;
      if(operation==='create_task') changes=validateTask(input);
      else if(operation==='create_subtask') {
        const parent=await get(input.parent_task_id);
        changes=validateTask({area:parent.area,project:parent.project,owner:parent.owner,...input});
        if(changes.area!==parent.area||changes.project!==parent.project) fail('Subtaskul trebuie să aparțină proiectului părintelui.');
      } else if(operation==='update_task'||operation==='complete_task') {
        const {id,...fields}=input; taskId=positiveId(id); before=await get(taskId);
        if(operation==='complete_task' && Object.keys(fields).length) fail('Finalizarea acceptă doar ID-ul.');
        changes=validateTask(operation==='complete_task'?{status:'Finalizat'}:fields,true);
        if(before.parent_task_id && ('area' in changes||'project' in changes)) fail('Proiectul unui subtask nu se poate schimba.');
        if(('area' in changes||'project' in changes) && await one('SELECT id FROM tasks WHERE parent_task_id=? LIMIT 1',[taskId])) fail('Un task cu subtaskuri nu se poate muta în alt proiect.');
        if(changes.status==='Finalizat' && await one("SELECT id FROM tasks WHERE parent_task_id=? AND status!='Finalizat' LIMIT 1",[taskId])) fail('Finalizează mai întâi subtaskurile.');
      } else fail('Operație necunoscută.');
      if(changes.parent_task_id) await get(changes.parent_task_id);
      const id=crypto.randomUUID(), now=clock(), expires=new Date(now.getTime()+15*60*1000).toISOString();
      await stmt('INSERT INTO task_changes (id,user_id,operation,task_id,payload,before_json,expires_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[id,user.id,operation,taskId,JSON.stringify(changes),JSON.stringify(before),expires,'pending',now.toISOString()]).run();
      return {proposal_id:id,status:'pending',before,after:{...before,...changes},expires_at:expires,confirmation_required:true};
    },
    async proposal(id) {
      const p=await one('SELECT * FROM task_changes WHERE id=? AND user_id=?',[text(id,100,true),user.id]);
      if(!p) fail('Propunerea nu există sau nu îți aparține.'); return p;
    },
    async decide(id, accept) {
      // This method is only exposed through the authenticated confirmation page, NEVER MCP.
      write(); if(typeof accept!=='boolean') fail('Decizie invalidă.');
      const p=await this.proposal(id);
      if(p.status==='applied') return {status:'applied',task:JSON.parse(p.result_json)};
      if(p.status!=='pending') fail('Propunerea nu mai este activă.');
      const now=clock().toISOString(); if(p.expires_at<=now) fail('Propunerea a expirat.');
      if(!accept) { await stmt("UPDATE task_changes SET status='cancelled' WHERE id=? AND user_id=? AND status='pending'",[id,user.id]).run(); const receipt=await this.proposal(id); return {status:receipt.status}; }
      const payload=JSON.parse(p.payload), before=JSON.parse(p.before_json), attempt=crypto.randomUUID();
      const conditions=["id=? AND user_id=? AND status='pending' AND expires_at>?"];
      const params=[attempt,id,user.id,now];
      if(before) {
        conditions.push(`EXISTS (SELECT 1 FROM tasks WHERE id=? AND updated_at=? AND ${Object.values(columns).map(c=>`${c} IS ?`).join(' AND ')})`);
        params.push(before.id,before.updatedAt,...Object.keys(columns).map(k=>before[k]));
        if('area' in payload||'project' in payload) { conditions.push('NOT EXISTS (SELECT 1 FROM tasks WHERE parent_task_id=?)'); params.push(before.id); }
      }
      if(payload.parent_task_id) { conditions.push('EXISTS (SELECT 1 FROM tasks WHERE id=? AND area=? AND project=?)'); params.push(payload.parent_task_id,payload.area,payload.project); }
      if(payload.status==='Finalizat' && before) { conditions.push("NOT EXISTS (SELECT 1 FROM tasks WHERE parent_task_id=? AND status!='Finalizat')"); params.push(before.id); }
      const claim=stmt(`UPDATE task_changes SET attempt=? WHERE ${conditions.join(' AND ')}`,params);
      const guard='EXISTS (SELECT 1 FROM task_changes WHERE id=? AND attempt=? AND status=\'pending\')';
      let mutation;
      if(before) {
        const entries=Object.entries(payload);
        mutation=stmt(`UPDATE tasks SET ${entries.map(([k])=>columns[k]+'=?').join(',')},updated_at=? WHERE id=? AND ${guard}`,[...entries.map(([,v])=>v),now,before.id,id,attempt]);
      } else {
        const entries=Object.entries(payload);
        mutation=stmt(`INSERT INTO tasks (${entries.map(([k])=>columns[k]).join(',')},created_at,updated_at) SELECT ${entries.map(()=>'?').join(',')},?,? WHERE ${guard}`,[...entries.map(([,v])=>v),now,now,id,attempt]);
      }
      const resultExpression=`(SELECT json_object('id',id,${Object.entries(columns).map(([k,c])=>`'${k}',${c}`).join(',')},'createdAt',created_at,'updatedAt',updated_at) FROM tasks WHERE id=${before?'?':'last_insert_rowid()'})`;
      const finish=stmt(`UPDATE task_changes SET status='applied',result_json=${resultExpression} WHERE id=? AND attempt=? AND status='pending'`,before?[before.id,id,attempt]:[id,attempt]);
      // D1 batches are atomic: the claim, task mutation and receipt commit together.
      await db.batch([claim,mutation,finish]);
      const receipt=await this.proposal(id);
      if(receipt.status!=='applied') fail('Taskul s-a schimbat. Cere o propunere nouă înainte de confirmare.');
      return {status:'applied',task:JSON.parse(receipt.result_json)};
    }
  };
}
