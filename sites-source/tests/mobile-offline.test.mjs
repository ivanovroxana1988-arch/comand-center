import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('service worker never intercepts APIs, attached documents or write requests',()=>{
 const handlers={};let network=0,cache=0;
 const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,caches:{match:()=>{cache++}},fetch:()=>{network++;return Promise.resolve(new Response('online'))}});
 for(const request of [
  {url:'https://example.test/api/tasks',method:'GET',mode:'cors'},
  {url:'https://example.test/api/attachments/file',method:'GET',mode:'cors'},
  {url:'https://example.test/api/tasks',method:'POST',mode:'cors'},
  {url:'https://accounts.google.com/',method:'GET',mode:'navigate'},
 ])handlers.fetch({request,respondWith:()=>assert.fail('Private requests must use the network directly')});
 assert.equal(network,0);assert.equal(cache,0);
});
test('manifest installs with local icons, standalone display and the original workspace origin',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons){const bytes=readFileSync(new URL('../public'+icon.src,import.meta.url));assert.equal(bytes.readUInt32BE(0),0x89504e47);assert.ok(['192x192','512x512'].includes(icon.sizes))}
});
