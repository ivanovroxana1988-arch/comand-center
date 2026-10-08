import { taskService } from '../command-center.mjs';
import { configSchema, answersSchema, contractsSchema, evaluate, validateAnswers } from './evaluation.mjs';

export class ModuleError extends Error {
  constructor(message, status=400) { super(message); this.status=status; }
}
const fail=(message,status=400)=>{throw new ModuleError(message,status)};
const rules={
  companies:{required:['name','cui'], fields:['name','cui','registration','address','representative','email','phone','caen','cpv','notes']},
  associations:{required:['name','leaderId'], fields:['name','leaderId','notes']},
  members:{required:['associationId','companyId','role'],fields:['associationId','companyId','role','responsibility','share']},
  experience:{required:['companyId','title','beneficiary'],fields:['companyId','title','beneficiary','description','value','currency','startDate','endDate','evidenceUrl','notes']},
  experts:{required:['name'],fields:['name','email','phone','skills','certifications','availability','notes']},
  requirements:{required:['tenderId','title','category'],fields:['tenderId','title','category','sourceUrl','sourceExcerpt','status','notes']},
  configurations:{required:['tenderId','title','config'],fields:['tenderId','title','config','notes']},
  applications:{required:['tenderId','expertId','role'],fields:['tenderId','expertId','role','status','selected','notes','configurationId','answers','contracts']},
  documents:{required:['title','category'],fields:['title','category','companyId','expertId','tenderId','url','expiryDate','signatureStatus','status','notes']},
  dossiers:{required:['tenderId','title'],fields:['tenderId','title','status','notes']},
};
export const moduleKinds=Object.keys(rules);
const references={companyId:'companies',leaderId:'companies',associationId:'associations',expertId:'experts',configurationId:'configurations'};
const enums={currency:['RON','EUR','USD'],signatureStatus:['unknown','unsigned','signed'],availability:['unknown','available','unavailable'],category:['administrative','technical','financial','expert','eligibility','scoring','other']};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function validate(kind, input) {
  const rule=Object.hasOwn(rules,kind)?rules[kind]:null; if(!rule)fail('Secțiune necunoscută.',404);
  if(!object(input))fail('Date invalide.');
  const result={};
  for(const [k,v] of Object.entries(input)){
    if(!rule.fields.includes(k))fail('Câmp necunoscut: '+k);
    if(v===null&&!rule.required.includes(k))continue;
    const schema={config:configSchema,answers:answersSchema,contracts:contractsSchema}[k];
    if(schema){
      const parsed=schema.safeParse(v);
      if(!parsed.success)fail('Configurație sau răspunsuri invalide: '+parsed.error.issues.map(i=>i.message).join('; '));
      result[k]=parsed.data;continue;
    }
    if(k==='tenderId'){if(!Number.isSafeInteger(v)||v<1)fail('Licitație invalidă.');result[k]=v;continue}
    if(k==='selected'){if(typeof v!=='boolean')fail('Selecție invalidă.');result[k]=v;continue}
    if(['value','share'].includes(k)){if(typeof v!=='number'||!Number.isFinite(v)||v<0||(k==='share'&&v>100))fail('Valoare numerică invalidă.');result[k]=v;continue}
    if(typeof v!=='string'||v.length>12000)fail('Text invalid sau prea lung.');
    result[k]=v.trim();
    if(k.endsWith('Date')&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))fail('Dată invalidă.');
    if((k==='url'||k.endsWith('Url'))&&v){let u;try{u=new URL(v)}catch{fail('Link invalid.')}if(!['https:','http:'].includes(u.protocol))fail('Linkul trebuie să fie HTTP/HTTPS.')}
    if(enums[k]&&v&&!enums[k].includes(v))fail('Valoare invalidă: '+k);
  }
  for(const key of rule.required)if(!result[key])fail('Câmp obligatoriu: '+key);
  if(result.startDate&&result.endDate&&result.startDate>result.endDate)fail('Data de finalizare precede începutul.');
  if(kind==='documents'&&!result.companyId&&!result.expertId&&!result.tenderId)fail('Leagă documentul de o companie, un expert sau o licitație.');
  return result;
}
export function licitatiiService(db,user){
  if(!user?.id)fail('Autentificare necesară.',401);
  const statement=(sql,args=[])=>db.prepare(sql).bind(...args);
  const decode=row=>row?{id:row.id,kind:row.kind,...JSON.parse(row.data),version:row.version,archived:!!row.archived,createdAt:row.created_at,updatedAt:row.updated_at}:null;
  async function get(kind,id){
    if(!Object.hasOwn(rules,kind))fail('Secțiune necunoscută.',404);
    const row=await statement('SELECT * FROM licitatii_records WHERE kind=? AND id=?',[kind,id]).first();
    if(!row)fail('Înregistrarea nu există.',404); return decode(row);
  }
  async function checkLinks(data){
    for(const [key,kind] of Object.entries(references))if(data[key]){const row=await get(kind,data[key]);if(row.archived)fail('Înregistrarea asociată este arhivată.')}
    if(data.tenderId&&!await statement('SELECT id FROM tenders WHERE id=?',[data.tenderId]).first())fail('Licitația nu există.',404);
    if(data.configurationId){
      const config=await get('configurations',data.configurationId);
      if(config.tenderId!==data.tenderId)fail('Formularul aparține altei licitații.');
      const issues=validateAnswers(config.config,data.answers||{});
      if(data.status==='finalizat'&&issues.length)fail(issues.join('; '));
    }
    if(data.status==='finalizat'&&data.expertId&&!data.configurationId)fail('Alege formularul înainte de finalizare.');
  }
  return {
    get,
    async list(kind,filters={}){
      if(!Object.hasOwn(rules,kind))fail('Secțiune necunoscută.',404);
      const limit=Number(filters.limit??50),offset=Number(filters.offset??0);
      if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)fail('Paginare invalidă.');
      const where=['kind=?','archived=0'],args=[kind];
      if(filters.tenderId){where.push('tender_id=?');args.push(Number(filters.tenderId))}
      const r=await statement('SELECT * FROM licitatii_records WHERE '+where.join(' AND ')+' ORDER BY updated_at DESC,id LIMIT ? OFFSET ?',[...args,limit+1,offset]).all();
      return {items:r.results.slice(0,limit).map(decode),nextOffset:r.results.length>limit?offset+limit:null};
    },
    async create(kind,input){
      const data=validate(kind,input);await checkLinks(data);
      const id=crypto.randomUUID(),now=new Date().toISOString();
      await statement('INSERT INTO licitatii_records (id,kind,tender_id,data,version,archived,created_by,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?,?)',[id,kind,data.tenderId??null,JSON.stringify(data),user.id,now,now]).run();
      return get(kind,id);
    },
    async update(kind,id,version,patch){
      if(!Number.isInteger(version)||version<1)fail('Versiune obligatorie.');
      const before=await get(kind,id);
      if(before.archived)fail('Înregistrarea este arhivată.',409);
      const old=Object.fromEntries(rules[kind].fields.filter(k=>k in before).map(k=>[k,before[k]]));
      const data=validate(kind,{...old,...patch});await checkLinks(data);
      const now=new Date().toISOString();
      const result=await statement('UPDATE licitatii_records SET data=?,tender_id=?,version=version+1,updated_at=? WHERE id=? AND kind=? AND version=? AND archived=0',[JSON.stringify(data),data.tenderId??null,now,id,kind,version]).run();
      if(result.meta.changes!==1)fail('Datele au fost modificate de alt coleg. Reîncarcă înainte de salvare.',409);
      return get(kind,id);
    },
    async proposeTask(kind,id,input){
      const record=await get(kind,id);if(!record.tenderId)fail('Înregistrarea nu aparține unei licitații.');
      const tender=await statement('SELECT * FROM tenders WHERE id=?',[record.tenderId]).first();
      if(!tender)fail('Licitația nu există.',404);
      // Reuse the durable confirmation flow; this only creates a proposal.
      return taskService(db,{id:user.id,scopes:['tasks:read','tasks:write']}).propose('create_task',{
        area:'Licitații',tenderId:record.tenderId,project:tender.title,title:input.title||record.title||record.role,
        owner:input.owner||tender.owner,dueDate:input.dueDate||null,
        nextStep:input.nextStep||'',notes:'Sursă modul Licitații: '+kind+'/'+id+'; tenderId='+record.tenderId,
      });
    },
    async evaluate(configurationId,prices={}){
      const configuration=await get('configurations',configurationId);
      const r=await statement("SELECT * FROM licitatii_records WHERE kind='applications' AND tender_id=? AND archived=0 ORDER BY id LIMIT 1001",[configuration.tenderId]).all();
      if(r.results.length>1000)fail('Evaluarea depășește limita de 1000 de candidaturi.');
      const applications=r.results.map(decode).filter(p=>p.configurationId===configurationId);
      try{return {configurationId,configurationVersion:configuration.version,...evaluate(configuration.config,applications,prices)}}catch(e){fail(e.message)}
    },
  };
}
