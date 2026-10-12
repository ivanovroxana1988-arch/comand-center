import {APP_ORIGIN,digest,sessionUser} from './google-auth.mjs';
const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export class PushError extends Error{constructor(message,status=400){super(message);this.status=status}}
export function ownerFor(user){return {'ivanovroxana1988@gmail.com':'Roxana','bogdangeorge.vizitiu@gmail.com':'Bogdan'}[user?.email]||null}
export function validEndpoint(value){
 let url;try{url=new URL(value)}catch{throw new PushError('Abonament invalid.')}
 const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||/^[a-z0-9.-]+\.push\.apple\.com$/.test(url.hostname);
 if(typeof value!=='string'||value.length>2048||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!allowed)throw new PushError('Serviciu push nepermis.');
 return url.href;
}
export async function pushKeys(db){
 let row=await db.prepare('SELECT value FROM notification_config WHERE id=?').bind('vapid').first();
 if(!row){
  const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const value=JSON.stringify({publicKey:b64(new Uint8Array(await crypto.subtle.exportKey('raw',key.publicKey))),privateKey:await crypto.subtle.exportKey('jwk',key.privateKey)});
  await db.prepare('INSERT INTO notification_config(id,value) VALUES(?,?) ON CONFLICT(id) DO NOTHING').bind('vapid',value).run();
  row=await db.prepare('SELECT value FROM notification_config WHERE id=?').bind('vapid').first();
 }
 return JSON.parse(row.value);
}
export async function sendPush(endpoint,keys,fetcher=fetch,now=Date.now()){
 endpoint=validEndpoint(endpoint);
 const header=b64(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=b64(encoder.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+3600,sub:APP_ORIGIN})));
 const key=await crypto.subtle.importKey('jwk',keys.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(header+'.'+claims))));
 // Empty push: no task titles, notes or documents are sent to the push provider.
 const response=await fetcher(endpoint,{method:'POST',redirect:'error',headers:{Authorization:`vapid t=${header}.${claims}.${signature}, k=${keys.publicKey}`,TTL:'3600',Urgency:'normal'},signal:AbortSignal.timeout(10000)});
 return {ok:response.ok,status:response.status};
}
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function notificationRoute(request,env){
 const path=new URL(request.url).pathname;
 if(!['/api/notifications','/api/notifications/test'].includes(path))return null;
 const user=await sessionUser(request,env),owner=ownerFor(user);
 if(!owner)return json({error:'Autentificare necesară.'},401);
 if(request.method==='GET'&&path==='/api/notifications'){
  const keys=await pushKeys(env.DB);
  const subscriptions=await env.DB.prepare('SELECT id FROM push_subscriptions WHERE user_id=?').bind(user.id).all();
  return json({owner,publicKey:keys.publicKey,subscriptions:subscriptions.results.map(s=>s.id)});
 }
 if(request.headers.get('origin')!==APP_ORIGIN)return json({error:'Cerere neautorizată.'},403);
 if(!['POST','DELETE'].includes(request.method))return json({error:'Metodă nepermisă.'},405);
 try{
  if(Number(request.headers.get('content-length'))>8192)throw new PushError('Cerere prea mare.',413);
  const text=await request.text();if(text.length>8192)throw new PushError('Cerere prea mare.',413);
  const input=JSON.parse(text),endpoint=validEndpoint(input.endpoint),id=await digest(endpoint);
  const existing=await env.DB.prepare('SELECT * FROM push_subscriptions WHERE id=?').bind(id).first();
  if(existing&&existing.user_id!==user.id)throw new PushError('Acest dispozitiv este asociat altui cont. Dezactivează notificările din acel cont înainte de schimbare.',409);
  if(request.method==='DELETE'){
   await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=? AND user_id=?').bind(id,user.id).run();return json({disabled:true});
  }
  if(path==='/api/notifications/test'){
   if(!existing)throw new PushError('Activează întâi notificările pe acest dispozitiv.');
   const sent=await sendPush(endpoint,await pushKeys(env.DB));
   if(!sent.ok)throw new PushError('Serviciul telefonului nu a acceptat notificarea. Încearcă să reactivezi notificările.',502);
   return json({sent:true});
  }
  const timeZone=typeof input.timeZone==='string'?input.timeZone:'Europe/Bucharest';
  try{new Intl.DateTimeFormat('en',{timeZone}).format()}catch{throw new PushError('Fus orar invalid.')}
  if(!existing){const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?').bind(user.id).first();if(count.n>=5)throw new PushError('Maximum 5 dispozitive per cont.',409)}
  await env.DB.prepare('INSERT INTO push_subscriptions(id,user_id,owner,endpoint,time_zone,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET time_zone=excluded.time_zone WHERE user_id=excluded.user_id').bind(id,user.id,owner,endpoint,timeZone,new Date().toISOString()).run();
  return json({enabled:true,owner});
 }catch(error){return json({error:error instanceof PushError?error.message:'Notificările nu au putut fi configurate.'},error instanceof PushError?error.status:400)}
}
export async function enqueueDueReminders(db,now=new Date()){
 const subscriptions=await db.prepare('SELECT DISTINCT owner,time_zone FROM push_subscriptions').bind().all();
 for(const sub of subscriptions.results){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:sub.time_zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  if(Number(parts.hour)<9)continue;
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  const task=await db.prepare("SELECT id FROM tasks WHERE owner IN (?, 'Împreună') AND due_date IS NOT NULL AND due_date<=? AND status!='Finalizat' LIMIT 1").bind(sub.owner,date).first();
  if(task)await db.prepare("INSERT INTO notification_events(id,owner,kind,created_at) VALUES(?,?,'deadline',?) ON CONFLICT(id) DO NOTHING").bind('due:'+sub.owner+':'+date,sub.owner,now.toISOString()).run();
 }
}
export async function drainNotifications(db,fetcher=fetch,now=Date.now()){
 const pending=await db.prepare(`SELECT e.id AS event_id,s.id AS subscription_id,s.endpoint FROM notification_events e JOIN push_subscriptions s ON (s.owner=e.owner OR e.owner='Împreună') LEFT JOIN notification_deliveries d ON d.event_id=e.id AND d.subscription_id=s.id WHERE e.kind IN ('created','assigned','deadline') AND e.created_at>=s.created_at AND e.created_at>=? AND (d.event_id IS NULL OR (d.status='failed' AND d.next_attempt<=? AND d.attempts<6) OR (d.status='sending' AND d.next_attempt<=?)) ORDER BY e.created_at LIMIT 6`).bind(new Date(now-86400000).toISOString(),now,now).all();
 if(!pending.results.length)return;
 const keys=await pushKeys(db),groups=new Map();
 for(const row of pending.results){
  const claimed=await db.prepare(`INSERT INTO notification_deliveries(event_id,subscription_id,status,attempts,next_attempt) VALUES(?,?,'sending',1,?) ON CONFLICT(event_id,subscription_id) DO UPDATE SET status='sending',attempts=attempts+1,next_attempt=excluded.next_attempt WHERE (status='failed' AND next_attempt<=? AND attempts<6) OR (status='sending' AND next_attempt<=?)`).bind(row.event_id,row.subscription_id,now+60000,now,now).run();
  if(claimed.meta?.changes!==1)continue;
  const group=groups.get(row.subscription_id)||[];group.push(row);groups.set(row.subscription_id,group);
 }
 for(const rows of groups.values()){
  let result;try{result=await sendPush(rows[0].endpoint,keys,fetcher,now)}catch{result={ok:false,status:0}}
  if([404,410].includes(result.status))await db.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(rows[0].subscription_id).run();
  for(const row of rows)await db.prepare('UPDATE notification_deliveries SET status=?,next_attempt=? WHERE event_id=? AND subscription_id=?').bind(result.ok?'sent':'failed',now+300000,row.event_id,row.subscription_id).run();
 }
}
