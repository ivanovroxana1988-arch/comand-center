import { APP_ORIGIN, digest, sessionUser } from './google-auth.mjs';
import { taskService } from './command-center.mjs';
import { mcpResponse } from './mcp-transport.mjs';

export const RESOURCE = APP_ORIGIN + '/mcp';
export const CLIENT = 'https://chatgpt.com/oauth/client.json';
export const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const SCOPES = ['tasks:read', 'tasks:write'];
const random = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'cache-control':'no-store',...headers}});
const fail = (error='invalid_request',status=400) => json({error},status);
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html = body => new Response(`<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectare ChatGPT · Command Center</title><style>body{font:16px system-ui;color:#182126;background:#faf9f6;padding:24px}main{max-width:600px;margin:7vh auto}h1{font:42px Georgia}p,li{line-height:1.6}button,a{display:inline-block;padding:12px 18px;margin:8px 8px 8px 0}button{background:#182126;color:white;border:0;font:inherit;cursor:pointer}a{color:#315f78}form{padding:20px 0;border-top:1px solid #b7c0c0}</style><main>${body}</main></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
const redirect = location => new Response(null,{status:303,headers:{location,'cache-control':'no-store','referrer-policy':'no-referrer'}});
function callback(params) { const u=new URL(REDIRECT);u.search=new URLSearchParams({...params,iss:APP_ORIGIN}).toString();return redirect(u.href); }
function challenge() {return json({error:'invalid_token'},401,{'www-authenticate':`Bearer resource_metadata="${APP_ORIGIN}/.well-known/oauth-protected-resource", scope="tasks:read tasks:write"`});}
async function bodyParams(request) {
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new Error('Invalid content type');
  const text=await request.text();if(text.length>8192)throw new Error('Too large');
  const p=new URLSearchParams(text);for(const key of p.keys())if(p.getAll(key).length!==1)throw new Error('Duplicate parameter');return p;
}
async function saveSecret(db,type,payload,expires,grantId=null) {
  const value=random();await db.prepare('INSERT INTO mcp_oauth_secrets (hash, kind, payload, expires_at, grant_id, used) VALUES (?, ?, ?, ?, ?, 0)').bind(await digest(value),type,JSON.stringify(payload),expires,grantId).run();return value;
}
async function takeSecret(db,value,type,now) {
  if(!tokenPattern.test(value||''))return null;
  return db.prepare('UPDATE mcp_oauth_secrets SET used = 1 WHERE hash = ? AND kind = ? AND expires_at > ? AND used = 0 RETURNING *').bind(await digest(value),type,now).first();
}
async function grant(db,id,now) {return db.prepare('SELECT * FROM mcp_oauth_grants WHERE id = ? AND revoked = 0 AND expires_at > ?').bind(id,now).first();}
export async function bearerPrincipal(request,env,now=Date.now()) {
  const value=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];if(!value)return null;
  const row=await env.DB.prepare('SELECT * FROM mcp_oauth_secrets WHERE hash = ? AND kind = ? AND expires_at > ? AND used = 0').bind(await digest(value),'access',now).first();
  if(!row)return null;const g=await grant(env.DB,row.grant_id,now);
  if(!g||g.resource!==RESOURCE||g.client_id!==CLIENT)return null;
  const scopes=g.scope.split(' ');if(!scopes.includes('tasks:read')||scopes.some(s=>!SCOPES.includes(s)))return null;
  return {id:g.user_id,scopes};
}
async function clientMetadata(fetcher) {
  // Fixed official URL, no user-controlled network targets or redirects.
  const r=await fetcher(CLIENT,{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Client metadata unavailable');
  const raw=await r.text();if(raw.length>32768)throw new Error('Client metadata too large');
  const c=JSON.parse(raw);const methods=c.token_endpoint_auth_methods_supported||[c.token_endpoint_auth_method];
  if(c.client_id!==CLIENT||!c.redirect_uris?.includes(REDIRECT)||!methods.includes('none'))throw new Error('Unsupported client');
}
function authorizationParams(url) {
  const p=url.searchParams;for(const key of p.keys())if(p.getAll(key).length!==1)throw new Error('Duplicate parameter');
  if(p.get('client_id')!==CLIENT||p.get('redirect_uri')!==REDIRECT||p.get('resource')!==RESOURCE||p.get('response_type')!=='code'||p.get('code_challenge_method')!=='S256'||!tokenPattern.test(p.get('code_challenge')||''))throw new Error('Invalid authorization request');
  const state=p.get('state')||'';if(!state||state.length>1024)throw new Error('Invalid state');
  const scopes=(p.get('scope')||'').split(' ');if(!scopes.includes('tasks:read')||scopes.some(s=>!SCOPES.includes(s)))throw new Error('Invalid scope');
  return {client_id:CLIENT,redirect_uri:REDIRECT,resource:RESOURCE,challenge:p.get('code_challenge'),scope:[...new Set(scopes)].join(' '),state};
}
async function issueTokens(db,g,now) {
  const access=await saveSecret(db,'access',{},Math.min(now+3600000,g.expires_at),g.id);
  const refresh=await saveSecret(db,'refresh',{},g.expires_at,g.id);
  return json({access_token:access,token_type:'Bearer',expires_in:Math.floor((Math.min(now+3600000,g.expires_at)-now)/1000),refresh_token:refresh,scope:g.scope});
}

// Returns null only for routes not owned by this OAuth/MCP module.
export async function oauthRoute(request,env,fetcher=fetch,now=Date.now()) {
  const url=new URL(request.url),path=url.pathname;
  if(!['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-authorization-server','/oauth/authorize','/oauth/token','/oauth/connections','/mcp'].includes(path))return null;
  if(url.origin!==APP_ORIGIN)return fail('invalid_request',403);
  if(request.headers.has('origin')&&request.headers.get('origin')!==APP_ORIGIN)return fail('invalid_request',403);
  if(path.startsWith('/.well-known/')) {
    if(request.method!=='GET')return new Response(null,{status:405});
    return path.endsWith('oauth-authorization-server')?json({issuer:APP_ORIGIN,authorization_response_iss_parameter_supported:true,authorization_endpoint:APP_ORIGIN+'/oauth/authorize',token_endpoint:APP_ORIGIN+'/oauth/token',client_id_metadata_document_supported:true,token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],scopes_supported:SCOPES}):json({resource:RESOURCE,authorization_servers:[APP_ORIGIN],scopes_supported:SCOPES,bearer_methods_supported:['header']});
  }
  if(!env.DB||env.COMMAND_CENTER_SETUP_MODE==='true'||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return fail('temporarily_unavailable',503);
  if(path==='/mcp') {
    const principal=await bearerPrincipal(request,env,now);if(!principal)return challenge();
    return mcpResponse(request,taskService(env.DB,principal),APP_ORIGIN);
  }
  if(path==='/oauth/token') {
    if(request.method!=='POST')return new Response(null,{status:405});
    let p;try{p=await bodyParams(request)}catch{return fail()}
    if(p.get('client_id')!==CLIENT||p.has('client_secret')||request.headers.has('authorization'))return fail('invalid_client',401);
    if(p.get('resource')!==RESOURCE)return fail('invalid_target');
    if(p.get('grant_type')==='authorization_code') {
      if(p.get('redirect_uri')!==REDIRECT||!/^[A-Za-z0-9._~-]{43,128}$/.test(p.get('code_verifier')||''))return fail('invalid_grant');
      const row=await takeSecret(env.DB,p.get('code'),'code',now);if(!row)return fail('invalid_grant');
      const data=JSON.parse(row.payload);
      if(data.challenge!==await digest(p.get('code_verifier')))return fail('invalid_grant');
      const g=await grant(env.DB,row.grant_id,now);if(!g||g.client_id!==CLIENT||g.resource!==RESOURCE)return fail('invalid_grant');
      return issueTokens(env.DB,g,now);
    }
    if(p.get('grant_type')==='refresh_token') {
      const value=p.get('refresh_token');const row=await takeSecret(env.DB,value,'refresh',now);
      if(!row) {
        // Retain consumed refresh hashes to detect replay and revoke the family.
        if(tokenPattern.test(value||''))await env.DB.prepare("UPDATE mcp_oauth_grants SET revoked = 1 WHERE id IN (SELECT grant_id FROM mcp_oauth_secrets WHERE hash = ? AND kind = 'refresh' AND used = 1)").bind(await digest(value)).run();
        return fail('invalid_grant');
      }
      const g=await grant(env.DB,row.grant_id,now);if(!g||g.resource!==RESOURCE||g.client_id!==CLIENT)return fail('invalid_grant');
      if(p.has('scope')&&p.get('scope')!==g.scope)return fail('invalid_scope');
      return issueTokens(env.DB,g,now);
    }
    return fail('unsupported_grant_type');
  }
  const user=await sessionUser(request,env,now);
  if(path==='/oauth/authorize') {
    if(request.method==='GET') {
      let params;try{params=authorizationParams(url);await clientMetadata(fetcher)}catch{return fail()}
      if(!user)return redirect('/auth/google/start?return_to='+encodeURIComponent(url.pathname+url.search));
      const csrf=await saveSecret(env.DB,'consent',{...params,user_id:user.id},now+600000);
      return html(`<h1>Conectează ChatGPT</h1><p>Cont: <strong>${escape(user.email)}</strong></p><ul><li>Citirea taskurilor din cele cinci arii.</li>${params.scope.includes('tasks:write')?'<li>Propuneri de creare, modificare și finalizare, cu confirmare separată pentru fiecare schimbare.</li>':''}</ul><p>Poți revoca accesul oricând. Conexiunea este valabilă cel mult 30 de zile înainte de o nouă autorizare.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="consent" value="${csrf}"><button name="decision" value="allow">Autorizează ChatGPT</button><button name="decision" value="deny">Anulează</button></form>`);
    }
    if(request.method!=='POST')return new Response(null,{status:405});
    if(!user||request.headers.get('origin')!==APP_ORIGIN)return fail('access_denied',403);
    let p;try{p=await bodyParams(request)}catch{return fail()}
    const row=await takeSecret(env.DB,p.get('consent'),'consent',now);if(!row)return fail();
    const data=JSON.parse(row.payload);if(data.user_id!==user.id)return fail('access_denied',403);
    if(p.get('decision')!=='allow')return callback({error:'access_denied',state:data.state});
    const id=random(),expires=now+30*86400000;
    await env.DB.prepare('INSERT INTO mcp_oauth_grants (id,user_id,client_id,resource,scope,expires_at,revoked) VALUES (?,?,?,?,?,?,0)').bind(id,user.id,CLIENT,RESOURCE,data.scope,expires).run();
    const code=await saveSecret(env.DB,'code',{challenge:data.challenge},now+120000,id);
    return callback({code,state:data.state});
  }
  if(path==='/oauth/connections') {
    if(!user)return redirect('/auth/google/start?return_to='+encodeURIComponent('/oauth/connections'));
    if(request.method==='POST') {
      if(request.headers.get('origin')!==APP_ORIGIN)return fail('access_denied',403);
      let p;try{p=await bodyParams(request)}catch{return fail()}
      const row=await takeSecret(env.DB,p.get('consent'),'revoke',now);
      if(!row||JSON.parse(row.payload).user_id!==user.id)return fail('access_denied',403);
      await env.DB.prepare('UPDATE mcp_oauth_grants SET revoked = 1 WHERE user_id = ?').bind(user.id).run();
      return html('<h1>Acces revocat</h1><p>Conexiunile ChatGPT ale contului tău au fost deconectate.</p><a href="/">Înapoi la dashboard</a>');
    }
    if(request.method!=='GET')return new Response(null,{status:405});
    const csrf=await saveSecret(env.DB,'revoke',{user_id:user.id},now+600000);
    return html(`<h1>Acces ChatGPT</h1><p>Revocarea oprește toate conexiunile ChatGPT autorizate de ${escape(user.email)}. Taskurile salvate rămân disponibile.</p><form method="post"><input type="hidden" name="consent" value="${csrf}"><button>Revocă accesul ChatGPT</button></form><a href="/">Înapoi la dashboard</a>`);
  }
}
