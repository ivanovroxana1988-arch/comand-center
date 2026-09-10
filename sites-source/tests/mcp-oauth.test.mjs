import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {oauthRoute,bearerPrincipal,CLIENT,REDIRECT,RESOURCE} from '../lib/mcp-oauth.mjs';
import {APP_ORIGIN,digest} from '../lib/google-auth.mjs';
import {taskService} from '../lib/command-center.mjs';
const fetcher=async()=>Response.json({client_id:CLIENT,redirect_uris:[REDIRECT],token_endpoint_auth_methods_supported:['none','private_key_jwt']});
const req=(p,o={})=>new Request(APP_ORIGIN+p,o);
const form=(data,cookie)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...(cookie?{cookie,origin:APP_ORIGIN}:{})},body:new URLSearchParams(data)});
async function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const DB={prepare(sql){return{bind(...args){return{first:async()=>sqlite.prepare(sql).get(...args)||null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>sqlite.prepare(sql).run(...args),execute:()=>sqlite.prepare(sql).run(...args)}}}},async batch(s){sqlite.exec('BEGIN');try{for(const p of s)p.execute();sqlite.exec('COMMIT')}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 const env={DB,GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'test-only'};
 const session='s'.repeat(43),cookie='__Host-cc_session='+session;
 sqlite.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(await digest(session),'google:123','ivanovroxana1988@gmail.com',Date.now()+28800000);
 const call=(p,o={})=>oauthRoute(req(p,o),env,fetcher);
 const verifier='v'.repeat(43);
 const params={client_id:CLIENT,redirect_uri:REDIRECT,resource:RESOURCE,response_type:'code',code_challenge:await digest(verifier),code_challenge_method:'S256',scope:'tasks:read tasks:write',state:'client-state'};
 const authorize=async(overrides={})=>{
  const page=await call('/oauth/authorize?'+new URLSearchParams({...params,...overrides}),{headers:{cookie}});
  const consent=(await page.text()).match(/name="consent" value="([^"]+)"/)[1];
  return {consent,finish:decision=>call('/oauth/authorize',form({consent,decision},cookie))};
 };
 const code=async(overrides={})=>new URL((await(await authorize(overrides)).finish('allow')).headers.get('location')).searchParams.get('code');
 const exchange=async(value,overrides={})=>call('/oauth/token',form({grant_type:'authorization_code',client_id:CLIENT,redirect_uri:REDIRECT,resource:RESOURCE,code:value,code_verifier:verifier,...overrides}));
 return {env,sqlite,cookie,call,params,authorize,code,exchange};
}
test('discovery and unauthenticated challenge; invalid redirects, scopes and origins rejected',async()=>{
 const s=await setup();
 const meta=await(await s.call('/.well-known/oauth-authorization-server')).json();assert.deepEqual(meta.code_challenge_methods_supported,['S256']);assert.equal(meta.authorization_response_iss_parameter_supported,true);
 const no=await s.call('/mcp');assert.equal(no.status,401);assert.match(no.headers.get('www-authenticate'),/resource_metadata/);
 assert.equal((await s.call('/mcp',{headers:{cookie:s.cookie}})).status,401);
 for(const override of [{redirect_uri:'https://evil.test/cb'},{client_id:'https://evil.test/client.json'},{scope:'admin'},{resource:APP_ORIGIN},{code_challenge_method:'plain'}])assert.equal((await s.call('/oauth/authorize?'+new URLSearchParams({...s.params,...override}))).status,400);
 assert.equal((await s.call('/oauth/authorize?'+new URLSearchParams(s.params),{headers:{origin:'https://evil.test'}})).status,403);
 const login=await s.call('/oauth/authorize?'+new URLSearchParams(s.params));assert.equal(login.status,303);assert.match(login.headers.get('location'),/^\/auth\/google\/start\?return_to=/);
});
test('consent, issuer, single-use code, PKCE, scoped MCP proposals and browser approval identity',async()=>{
 const s=await setup(),a=await s.authorize();
 assert.equal((await s.call('/oauth/authorize',form({consent:a.consent,decision:'allow'}))).status,403);
 const result=await a.finish('allow'),location=new URL(result.headers.get('location'));
 assert.equal(location.origin+location.pathname,REDIRECT);assert.equal(location.searchParams.get('iss'),APP_ORIGIN);assert.equal(location.searchParams.get('state'),'client-state');
 assert.equal((await a.finish('allow')).status,400);
 const code=location.searchParams.get('code'),tokens=await(await s.exchange(code)).json();assert.ok(tokens.access_token);
 assert.equal((await s.exchange(code)).status,400);
 const principal=await bearerPrincipal(req('/mcp',{headers:{authorization:'Bearer '+tokens.access_token}}),s.env);assert.equal(principal.id,'google:123');
 const rpc=async(method,params)=> (await s.call('/mcp',{method:'POST',headers:{authorization:'Bearer '+tokens.access_token,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})).json();
 assert.equal((await rpc('tools/list')).result.tools.length,7);
 const proposal=(await rpc('tools/call',{name:'create_task',arguments:{area:'Licitații',project:'Test',title:'Dosar',owner:'Bogdan'}})).result.structuredContent;
 assert.equal(s.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,0);
 const browserService=taskService(s.env.DB,{id:'google:123',scopes:['tasks:read','tasks:write']});await browserService.decide(proposal.proposal_id,true);
 assert.equal((await rpc('tools/call',{name:'get_change_status',arguments:{proposal_id:proposal.proposal_id}})).result.structuredContent.status,'applied');
 assert.equal(s.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,1);
 const bad=await s.code();assert.equal((await s.exchange(bad,{code_verifier:'x'.repeat(43)})).status,400);assert.equal((await s.exchange(bad)).status,400);
});
test('read-only access cannot propose; refresh rotates, replay revokes; access expires',async()=>{
 const s=await setup(),tokens=await(await s.exchange(await s.code({scope:'tasks:read'}))).json();
 const headers={authorization:'Bearer '+tokens.access_token};const p=await bearerPrincipal(req('/mcp',{headers}),s.env);
 await assert.rejects(taskService(s.env.DB,p).propose('create_task',{area:'ONG',project:'Test',title:'Test',owner:'Bogdan'}));
 assert.equal(await bearerPrincipal(req('/mcp',{headers}),s.env,Date.now()+3601000),null);
 const refresh=value=>s.call('/oauth/token',form({grant_type:'refresh_token',client_id:CLIENT,resource:RESOURCE,refresh_token:value}));
 const newer=await(await refresh(tokens.refresh_token)).json();assert.ok(newer.access_token);
 assert.equal((await refresh(tokens.refresh_token)).status,400);
 assert.equal(await bearerPrincipal(req('/mcp',{headers:{authorization:'Bearer '+newer.access_token}}),s.env),null);
});
test('denial and account revocation are explicit, same-origin and leave task data untouched',async()=>{
 const s=await setup(),denied=new URL((await(await s.authorize()).finish('deny')).headers.get('location'));
 assert.equal(denied.searchParams.get('error'),'access_denied');assert.equal(denied.searchParams.get('iss'),APP_ORIGIN);
 const tokens=await(await s.exchange(await s.code())).json();
 const page=await s.call('/oauth/connections',{headers:{cookie:s.cookie}});const consent=(await page.text()).match(/name="consent" value="([^"]+)"/)[1];
 assert.equal((await s.call('/oauth/connections',form({consent},s.cookie))).status,200);
 assert.equal(await bearerPrincipal(req('/mcp',{headers:{authorization:'Bearer '+tokens.access_token}}),s.env),null);
 assert.equal(s.sqlite.prepare('SELECT count(*) n FROM tasks').get().n,0);
});
