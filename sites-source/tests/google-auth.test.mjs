import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {authGate,sessionUser,verifyGoogleToken,APP_ORIGIN} from '../lib/google-auth.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test',alg:'RS256',use:'sig'};
const b64=b=>Buffer.from(b).toString('base64url');
async function jwt(overrides={}) {
 const now=Math.floor(Date.now()/1000);
 const claims={iss:'https://accounts.google.com',aud:'client',sub:'123',iat:now,exp:now+3600,nonce:'nonce',email:'ivanovroxana1988@gmail.com',email_verified:true,...overrides};
 const text=b64(JSON.stringify({alg:'RS256',kid:'test'}))+'.'+b64(JSON.stringify(claims));
 return text+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(text)));
}
const keyFetch=async()=>Response.json({keys:[jwk]});
function setup() {
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const DB={prepare(sql){return{bind(...args){return {first:async()=>sqlite.prepare(sql).get(...args)||null,run:async()=>sqlite.prepare(sql).run(...args)}}}}};
 return {sqlite,env:{DB,GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'test-secret',COMMAND_CENTER_SETUP_MODE:'false'}};
}
const request=(path,options={})=>new Request(APP_ORIGIN+path,options);
test('Google token verifies signature, issuer, audience, nonce, expiry and allowed email',async()=>{
 assert.equal((await verifyGoogleToken(await jwt(),'client','nonce',keyFetch)).id,'google:123');
 for(const override of [{iss:'https://attacker.test'},{aud:'another'},{azp:'another'},{nonce:'wrong'},{exp:0},{email_verified:false},{email:'stranger@gmail.com'}])await assert.rejects(verifyGoogleToken(await jwt(override),'client','nonce',keyFetch));
 const valid=await jwt(); const parts=valid.split('.');parts[1]=b64(JSON.stringify({email:'bogdangeorge.vizitiu@gmail.com'}));
 await assert.rejects(verifyGoogleToken(parts.join('.'),'client','nonce',keyFetch));
});
test('anonymous/spoofed identity cannot read tasks; foreign origin cannot mutate',async()=>{
 const {env}=setup();
 assert.equal((await authGate(request('/api/tasks',{headers:{'oai-authenticated-user-id':'roxana'}}),env)).status,401);
 assert.equal((await authGate(request('/api/tasks',{method:'POST',headers:{origin:'https://attacker.test'}}),env)).status,403);
 assert.equal((await authGate(request('/mcp'),env)).status,401);
 assert.equal((await authGate(request('/'),{...env,GOOGLE_CLIENT_SECRET:''})).status,503);
});
test('login binds browser state, consumes callback once, issues expiring session and revokes on logout',async()=>{
 const {env,sqlite}=setup();
 const start=await authGate(request('/auth/google/start'),env);
 const location=new URL(start.headers.get('location'));
 assert.equal(location.origin,'https://accounts.google.com');
 assert.equal(location.searchParams.get('code_challenge_method'),'S256');
 assert.equal(location.searchParams.get('redirect_uri'),APP_ORIGIN+'/auth/google/callback');
 const browser=start.headers.get('set-cookie').split(';')[0];
 const callback='/auth/google/callback?state='+location.searchParams.get('state')+'&code=test-code';
 assert.equal((await authGate(request(callback),env)).status,400);
 const mock=async(url,options)=>{
   if(url.includes('/token')){assert.equal(options.body.get('client_secret'),'test-secret'); assert.equal(options.body.get('code_verifier').length,43);return Response.json({id_token:await jwt({nonce:location.searchParams.get('nonce')})});}
   return keyFetch();
 };
 const result=await authGate(request(callback,{headers:{cookie:browser}}),env,mock);
 assert.equal(result.status,303);
 const session=result.headers.getSetCookie().find(v=>v.startsWith('__Host-cc_session=')).split(';')[0];
 assert.equal((await sessionUser(request('/',{headers:{cookie:session}}),env)).email,'ivanovroxana1988@gmail.com');
 assert.equal((await authGate(request(callback,{headers:{cookie:browser}}),env,mock)).status,400);
 assert.equal(await sessionUser(request('/',{headers:{cookie:session}}),env,Date.now()+30000000),null);
 assert.equal((await authGate(request('/auth/logout',{method:'POST',headers:{cookie:session,origin:APP_ORIGIN}}),env)).status,303);
 assert.equal(await sessionUser(request('/',{headers:{cookie:session}}),env),null);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM tasks').get().n,0);
});
