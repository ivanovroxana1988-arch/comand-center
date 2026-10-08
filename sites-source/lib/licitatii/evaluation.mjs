import { z } from 'zod';

const key=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const points=z.number().finite().min(0).max(100);
const option=z.object({value:z.string().min(1).max(120),label:z.string().min(1).max(240)}).strict();
const field=z.object({
  id:key,label:z.string().trim().min(1).max(240),
  type:z.enum(['text','textarea','number','date','select','checkbox']),
  required:z.boolean().default(false),min:z.number().finite().optional(),max:z.number().finite().optional(),
  options:z.array(option).max(100).optional(),
}).strict().superRefine((v,ctx)=>{
  if(v.min!==undefined&&v.max!==undefined&&v.min>v.max)ctx.addIssue({code:'custom',message:'Minimul depășește maximul.'});
  if(v.type==='select'&&(!v.options?.length||new Set(v.options.map(x=>x.value)).size!==v.options.length))ctx.addIssue({code:'custom',message:'Opțiuni lipsă sau duplicate.'});
});
const source=z.object({scope:z.enum(['answer','contract_count_complex','contract_hours_sum','contract_topics_max']),key:key.optional()}).strict();
const factor=z.object({
  id:key,label:z.string().trim().min(1).max(240),maxPoints:points,
  aggregate:z.enum(['max','avg','sum']),source,
  type:z.enum(['threshold','map']),
  tiers:z.array(z.object({cutoff:z.number().finite(),points,operator:z.enum(['>','>='])}).strict()).max(100).optional(),
  map:z.array(z.object({value:z.string().max(240),points}).strict()).max(100).optional(),
}).strict().superRefine((v,ctx)=>{
  if(v.source.scope==='answer'&&!v.source.key)ctx.addIssue({code:'custom',message:'Factorul necesită un câmp sursă.'});
  if(v.type==='threshold'&&!v.tiers?.length)ctx.addIssue({code:'custom',message:'Praguri lipsă.'});
  if(v.type==='map'&&!v.map?.length)ctx.addIssue({code:'custom',message:'Mapare lipsă.'});
  if([...v.tiers||[],...v.map||[]].some(t=>t.points>v.maxPoints))ctx.addIssue({code:'custom',message:'Punctajul depășește maximul factorului.'});
  if(v.map&&new Set(v.map.map(x=>x.value)).size!==v.map.length)ctx.addIssue({code:'custom',message:'Valori duplicate în mapare.'});
});
const criterion=z.object({
  id:key,label:z.string().trim().min(1).max(240),source,
  operator:z.enum(['eq','gte','gt']),expected:z.union([z.boolean(),z.string().max(240),z.number().finite()]),
  sourceExcerpt:z.string().trim().min(1).max(4000),
}).strict();
export const configSchema=z.object({
  fields:z.array(field).max(100),factors:z.array(factor).max(50),criteria:z.array(criterion).max(100),
  pricePoints:points,priceFormula:z.enum(['lowest_over_offer']).default('lowest_over_offer'),
  sourceExcerpt:z.string().trim().min(1).max(12000),
}).strict().superRefine((v,ctx)=>{
  for(const group of [v.fields,v.factors,v.criteria])if(new Set(group.map(x=>x.id)).size!==group.length)ctx.addIssue({code:'custom',message:'Identificatori duplicați.'});
  if(v.factors.reduce((n,f)=>n+f.maxPoints,0)+v.pricePoints>100)ctx.addIssue({code:'custom',message:'Punctajul total depășește 100.'});
  for(const r of [...v.factors,...v.criteria]){
    if(r.source.scope==='answer'&&!v.fields.some(f=>f.id===r.source.key))ctx.addIssue({code:'custom',message:'Câmp sursă inexistent.'});
  }
});
export const answersSchema=z.record(key,z.union([z.string().max(12000),z.number().finite(),z.boolean(),z.null()])).refine(v=>Object.keys(v).length<=100);
export const contractsSchema=z.array(z.object({
  organization:z.string().trim().min(1).max(240),complex:z.boolean(),
  hours:z.number().finite().min(0),topics:z.number().int().min(0),
  evidenceUrl:z.string().url().refine(v=>/^https?:\/\//.test(v)).optional(),
}).strict()).max(200);
export function validateAnswers(config,answers){
  const issues=[];
  for(const k of Object.keys(answers))if(!config.fields.some(f=>f.id===k))issues.push('Câmp necunoscut: '+k);
  for(const f of config.fields){
    const v=answers[f.id],empty=v===undefined||v===null||(typeof v==='string'&&!v.trim());
    if(empty){if(f.required)issues.push('Completează: '+f.label);continue;}
    // false is a valid answer. Eligibility is checked separately, per criterion.
    if(f.type==='checkbox'&&typeof v!=='boolean')issues.push('Valoare da/nu necesară: '+f.label);
    if(f.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||(f.min!==undefined&&v<f.min)||(f.max!==undefined&&v>f.max)))issues.push('Număr în afara limitelor: '+f.label);
    if(['text','textarea','date','select'].includes(f.type)&&typeof v!=='string')issues.push('Text necesar: '+f.label);
    if(f.type==='select'&&!f.options.some(o=>o.value===v))issues.push('Opțiune invalidă: '+f.label);
    if(f.type==='date'&&(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))issues.push('Dată invalidă: '+f.label);
  }
  return issues;
}
function valueFor(source,answers,contracts){
  if(source.scope==='answer')return Object.hasOwn(answers,source.key)?answers[source.key]:null;
  // Missing evidence is unknown, not a zero-valued verified history.
  if(!contracts?.length)return null;
  if(source.scope==='contract_count_complex')return contracts.filter(c=>c.complex).length;
  if(source.scope==='contract_hours_sum')return contracts.reduce((n,c)=>n+c.hours,0);
  return Math.max(...contracts.map(c=>c.topics));
}
const round=n=>Math.round(n*100)/100;
export function evaluate(configInput,candidates,prices={}){
  const config=configSchema.parse(configInput);
  const people=candidates.map(p=>{
    const answers=answersSchema.parse(p.answers||{}),contracts=contractsSchema.parse(p.contracts||[]);
    const formIssues=validateAnswers(config,answers);
    const criteria=config.criteria.map(c=>{
      const value=valueFor(c.source,answers,contracts);
      const known=value!==null&&value!==undefined&&value!=='';
      let status='unknown';
      if(known){
        if(c.operator==='eq')status=value===c.expected?'pass':'fail';
        else if(typeof value==='number'&&typeof c.expected==='number')status=(c.operator==='gte'?value>=c.expected:value>c.expected)?'pass':'fail';
      }
      return {id:c.id,label:c.label,value,status,sourceExcerpt:c.sourceExcerpt};
    });
    const factors=config.factors.map(f=>{
      const value=valueFor(f.source,answers,contracts);
      if(value===null||value===undefined||value==='')return {id:f.id,points:null};
      if(f.type==='threshold'&&typeof value!=='number')return {id:f.id,points:null};
      const score=f.type==='map'?(f.map.find(x=>x.value===String(value))?.points??0):
        Math.max(0,...f.tiers.filter(t=>t.operator==='>'?value>t.cutoff:value>=t.cutoff).map(t=>t.points));
      return {id:f.id,points:Math.min(f.maxPoints,score)};
    });
    const eligibility=criteria.some(c=>c.status==='fail')?'fail':
      !criteria.length||formIssues.length||criteria.some(c=>c.status==='unknown')?'unknown':'pass';
    return {id:p.id,selected:p.selected===true,eligibility,criteria,factors,formIssues};
  });
  const selected=people.filter(p=>p.selected);
  const breakdown=config.factors.map(f=>{
    const scores=selected.map(p=>p.factors.find(x=>x.id===f.id).points);
    if(!scores.length||scores.some(x=>x===null))return {id:f.id,label:f.label,points:null,maxPoints:f.maxPoints};
    const value=f.aggregate==='max'?Math.max(...scores):scores.reduce((n,x)=>n+x,0)/(f.aggregate==='avg'?scores.length:1);
    return {id:f.id,label:f.label,points:round(Math.min(f.maxPoints,value)),maxPoints:f.maxPoints};
  });
  const technical=breakdown.some(f=>f.points===null)?null:round(breakdown.reduce((n,f)=>n+f.points,0));
  let price=null;
  if(prices.offer!==undefined||prices.lowest!==undefined){
    if(!Number.isFinite(prices.offer)||!Number.isFinite(prices.lowest)||prices.offer<=0||prices.lowest<=0||prices.lowest>prices.offer)throw new Error('Prețuri invalide pentru formula configurată.');
    price=round(prices.lowest/prices.offer*config.pricePoints);
  }else if(config.pricePoints===0)price=0;
  return {people,breakdown,technical,price,total:technical===null||price===null?null:round(technical+price),
    readiness:selected.length&&selected.every(p=>p.eligibility==='pass')?'review':'incomplete',
    notice:'Calcul pe baza regulilor și datelor introduse. Dovezile și conformitatea finală necesită verificare.'};
}
