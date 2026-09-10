export const APP_ORIGIN = 'https://comand-center.ivanovroxana1988.workers.dev';
const CALLBACK = APP_ORIGIN + '/auth/google/callback';
const ALLOWED = new Set(['ivanovroxana1988@gmail.com', 'bogdangeorge.vizitiu@gmail.com']);
const SESSION = '__Host-cc_session', STATE = '__Host-cc_login';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
function decode(s) { return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')), c=>c.charCodeAt(0)); }
function cookie(request, name) {
  const matches=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
  return matches.length===1 ? matches[0].slice(name.length+1) : '';
}
const setCookie = (name,value,age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
function response(body,status=200,extra={}) {
  return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",...extra}});
}
const redirect = (url,extra={}) => response(null,303,{location:url,...extra});
function safeReturn(value) {
  if(typeof value!=='string'||value.length>4096||!value.startsWith('/'))return '/';
  const u=new URL(value,APP_ORIGIN);
  return u.origin===APP_ORIGIN&&['/oauth/authorize','/oauth/connections','/confirm-change'].includes(u.pathname)?u.pathname+u.search:'/';
}
const page = (message,action='<a href="/auth/google/start">Continuă cu Google</a>') => `<!doctype html><html lang="ro"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Command Center</title><style>body{font:18px system-ui;background:#f5f7fb;color:#17223b;margin:0;padding:8vh 24px}main{max-width:540px;margin:auto;padding:32px;background:white;border-radius:16px}h1{font-size:28px}a,button{display:inline-block;background:#244fce;color:white;padding:14px 20px;border:0;border-radius:8px;font:inherit;text-decoration:none}p{line-height:1.6}</style><main><h1>Bogdan &amp; Roxana<br>Command Center</h1><p>${message}</p>${action}</main></html>`;

// Validate the Google-signed ID token, never a decoded-only JWT or caller header.
export async function verifyGoogleToken(token,clientId,nonce,fetcher=fetch,now=Date.now()) {
  if(typeof token!=='string'||token.length>16000)throw new Error('Invalid token');
  const parts=token.split('.'); if(parts.length!==3)throw new Error('Invalid token');
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Invalid algorithm');
  const res=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new Error('Google keys unavailable');
  const keys=await res.json();
  const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
  if(!jwk)throw new Error('Unknown key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw new Error('Invalid signature');
  const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||(claims.azp&&claims.azp!==clientId)||claims.nonce!==nonce||typeof claims.exp!=='number'||claims.exp<=now/1000||typeof claims.iat!=='number'||claims.iat>now/1000+60||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||claims.email_verified!==true||typeof claims.email!=='string')throw new Error('Invalid claims');
  const email=claims.email.toLowerCase();
  if(!ALLOWED.has(email))throw new Error('Account not allowed');
  return {id:'google:'+claims.sub,email};
}

export async function sessionUser(request,env,now=Date.now()) {
  const token=cookie(request,SESSION);if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!env.DB)return null;
  const row=await env.DB.prepare('SELECT user_id, email FROM auth_sessions WHERE token_hash = ? AND expires_at > ?').bind(await digest(token),now).first();
  return row&&ALLOWED.has(row.email)?{id:row.user_id,email:row.email}:null;
}

export async function authGate(request,env,fetcher=fetch) {
  const url=new URL(request.url), now=Date.now();
  if(url.origin!==APP_ORIGIN)return response('Adresă neautorizată.',403);
  if(env.COMMAND_CENTER_SETUP_MODE==='true'||!env.DB||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return response(page('Configurarea autentificării este în curs.',''),503);
  if(!['GET','HEAD','POST','PATCH','DELETE','PUT'].includes(request.method))return response('Method not allowed',405);
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==APP_ORIGIN)return response('Cerere neautorizată.',403);
  if(url.pathname==='/auth/google/start') {
    if(request.method!=='GET')return response('Method not allowed',405);
    const state=random(), browser=random(), verifier=random(), nonce=random();
    await env.DB.prepare('DELETE FROM auth_login_states WHERE expires_at <= ?').bind(now).run();
    await env.DB.prepare('INSERT INTO auth_login_states (state_hash, browser_hash, verifier, nonce, expires_at, return_to) VALUES (?, ?, ?, ?, ?, ?)').bind(await digest(state),await digest(browser),verifier,nonce,now+600000,safeReturn(url.searchParams.get('return_to'))).run();
    const google=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    google.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:CALLBACK,response_type:'code',scope:'openid email',state,nonce,code_challenge:await digest(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
    return redirect(google.href,{'set-cookie':setCookie(STATE,browser,600)});
  }
  if(url.pathname==='/auth/google/callback') {
    if(request.method!=='GET')return response('Method not allowed',405);
    const state=url.searchParams.get('state')||'', browser=cookie(request,STATE),code=url.searchParams.get('code');
    const clear={'set-cookie':setCookie(STATE,'',0)};
    if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(browser))return response(page('Conectarea a expirat. Încearcă din nou.'),400,clear);
    const login=await env.DB.prepare('DELETE FROM auth_login_states WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING verifier, nonce, return_to').bind(await digest(state),await digest(browser),now).first();
    if(!login||!code||code.length>4096||url.searchParams.has('error'))return response(page('Conectarea a expirat sau a fost anulată. Încearcă din nou.'),400,clear);
    try {
      const tokens=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,code,code_verifier:login.verifier,redirect_uri:CALLBACK,grant_type:'authorization_code'}),signal:AbortSignal.timeout(10000)});
      if(!tokens.ok)throw new Error('Token exchange failed');
      const data=await tokens.json();
      const user=await verifyGoogleToken(data.id_token,env.GOOGLE_CLIENT_ID,login.nonce,fetcher);
      const token=random(),old=cookie(request,SESSION);
      if(old)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(old)).run();
      await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now).run();
      await env.DB.prepare('INSERT INTO auth_sessions (token_hash, user_id, email, expires_at) VALUES (?, ?, ?, ?)').bind(await digest(token),user.id,user.email,now+28800000).run();
      const result=redirect(safeReturn(login.return_to));result.headers.append('set-cookie',setCookie(STATE,'',0));result.headers.append('set-cookie',setCookie(SESSION,token,28800));return result;
    } catch { return response(page('Conectarea nu a reușit. Accesul este disponibil doar pentru conturile Roxanei și ale lui Bogdan.'),403,clear); }
  }
  const user=await sessionUser(request,env,now);
  if(url.pathname==='/auth/logout') {
    if(request.method==='GET')return response(page('Vrei să ieși din cont?','<form method="post" action="/auth/logout"><button>Deconectare</button></form>'));
    if(request.method!=='POST')return response('Method not allowed',405);
    const token=cookie(request,SESSION);
    if(token)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    return redirect('/',{'set-cookie':setCookie(SESSION,'',0)});
  }
  // Browser login does not grant remote MCP access. Its OAuth flow is separate.
  if(url.pathname==='/mcp'||url.pathname.startsWith('/mcp/'))return response('Conexiunea OAuth MCP nu este încă activată.',401);
  if(!user)return url.pathname.startsWith('/api/')?response('Autentificare necesară.',401):response(page('Autentifică-te pentru a vedea proiectele și taskurile.'));
  return user;
}
