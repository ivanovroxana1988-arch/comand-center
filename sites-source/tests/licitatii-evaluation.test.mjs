import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,configSchema,validateAnswers} from '../lib/licitatii/evaluation.mjs';
const config={
  fields:[{id:'years',label:'Ani experiență',type:'number',required:true,min:0},{id:'certified',label:'Certificat',type:'checkbox',required:true}],
  factors:[{id:'experience',label:'Experiență',type:'threshold',source:{scope:'answer',key:'years'},maxPoints:60,aggregate:'sum',tiers:[{cutoff:5,points:60,operator:'>='},{cutoff:2,points:30,operator:'>='}]}],
  criteria:[{id:'certificate',label:'Certificat obligatoriu',source:{scope:'answer',key:'certified'},operator:'eq',expected:true,sourceExcerpt:'Cerință exemplu: certificat obligatoriu.'}],
  pricePoints:40,sourceExcerpt:'Exemplu de test: 60 puncte experiență, 40 preț.'
};
test('caps aggregated scores and applies configured financial formula',()=>{
  const result=evaluate(config,[{id:'a',selected:true,answers:{years:5,certified:true}},{id:'b',selected:true,answers:{years:5,certified:true}}],{offer:100,lowest:80});
  assert.equal(result.technical,60);assert.equal(result.price,32);assert.equal(result.total,92);
});
test('missing criteria or answers never produce an eligibility pass',()=>{
  assert.equal(evaluate(config,[{id:'a',selected:true,answers:{years:5}}]).people[0].eligibility,'unknown');
  assert.equal(evaluate({...config,criteria:[]},[{id:'a',answers:{years:5,certified:true}}]).people[0].eligibility,'unknown');
  assert.equal(evaluate(config,[{id:'a',selected:true,answers:{certified:true}}]).technical,null);
});
test('false is a completed checkbox answer but fails a true requirement',()=>{
  const parsed=configSchema.parse(config);
  assert.deepEqual(validateAnswers(parsed,{years:5,certified:false}),[]);
  assert.equal(evaluate(config,[{id:'a',answers:{years:5,certified:false}}]).people[0].eligibility,'fail');
});
test('rejects invalid factor sources, point totals and prices',()=>{
  assert.throws(()=>configSchema.parse({...config,pricePoints:50}));
  assert.throws(()=>configSchema.parse({...config,fields:[]}));
  assert.throws(()=>evaluate(config,[],{offer:100,lowest:200}));
  assert.throws(()=>evaluate(config,[],{offer:-1,lowest:0}));
});
test('tier order does not change score and unknown numeric values stay unknown',()=>{
  const reversed={...config,factors:[{...config.factors[0],tiers:[...config.factors[0].tiers].reverse()}]};
  assert.equal(evaluate(reversed,[{id:'a',selected:true,answers:{years:5,certified:true}}]).technical,60);
  assert.equal(evaluate(config,[{id:'a',selected:true,answers:{years:'five',certified:true}}]).technical,null);
});
