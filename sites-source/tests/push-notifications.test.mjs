import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {pushKeys,sendPush,validEndpoint,ownerFor,drainNotifications,enqueueDueReminders,notificationRoute} from '../lib/push-notifications.mjs';
import {APP_ORIGIN,digest} from '../lib/google-auth.mjs';
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(sql){return{bind(...args){return{first:async()=>sqlite.prepare(sql).get(...args)??null,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>{const r=sqlite.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}}}}}};
 return{db,sqlite};
}
test('routine status edits are quiet; new active tasks and reassignment create alerts',()=>{
 const {sqlite}=setup();
 sqlite.exec("INSERT INTO tasks(area,project,title,owner,created_at,updated_at) VALUES('ONG','Test','Task','Roxana','now','now')");
 assert.deepEqual(sqlite.prepare('SELECT kind,owner FROM notification_events').all().map(r=>[r.kind,r.owner]),[['created','Roxana']]);
 sqlite.exec("UPDATE tasks SET status='În lucru',next_step='Work' WHERE id=1");
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM notification_events').get().n,1);
 sqlite.exec("UPDATE tasks SET owner='Bogdan' WHERE id=1");
 assert.deepEqual(sqlite.prepare('SELECT kind,owner FROM notification_events WHERE kind=?').all('assigned').map(r=>[r.kind,r.owner]),[['assigned','Bogdan']]);
 sqlite.exec("UPDATE tasks SET status='Finalizat' WHERE id=1; UPDATE tasks SET owner='Roxana' WHERE id=1");
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM notification_events').get().n,2);
});
test('VAPID key stays server-side, is reused and produces a valid ES256 signature without task payload',async()=>{
 const {db}=setup(),keys=await pushKeys(db);assert.deepEqual(await pushKeys(db),keys);
 let request;
 await sendPush('https://fcm.googleapis.com/fcm/send/test',keys,async(url,init)=>{request={url,...init};return new Response(null,{status:201})},1791795600000);
 assert.equal(request.body,undefined);assert.equal(request.redirect,'error');
 const jwt=request.headers.Authorization.match(/t=([^,]+)/)[1],parts=jwt.split('.');
 const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,APP_ORIGIN);
 const publicJwk={...keys.privateKey};delete publicJwk.d;publicJwk.key_ops=['verify'];
 const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])));
});
test('only verified account emails determine the notification owner; arbitrary endpoints are rejected',()=>{
 assert.equal(ownerFor({email:'ivanovroxana1988@gmail.com'}),'Roxana');assert.equal(ownerFor({email:'bogdangeorge.vizitiu@gmail.com'}),'Bogdan');assert.equal(ownerFor({email:'other@example.test'}),null);
 for(const url of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:4433/a'])assert.throws(()=>validEndpoint(url));
});
test('Roxana events go only to her device; shared events reach both; repeated drains do not duplicate',async()=>{
 const {db,sqlite}=setup(),now=Date.now();
 for(const [id,owner] of [['r','Roxana'],['b','Bogdan']])sqlite.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?)').run(id,id,owner,'https://fcm.googleapis.com/fcm/send/'+id,'Europe/Bucharest',new Date(now-1000).toISOString());
 sqlite.prepare('INSERT INTO notification_events VALUES(?,NULL,?,?,?)').run('one','Roxana','created',new Date(now).toISOString());
 const sent=[];const fake=async endpoint=>{sent.push(endpoint);return new Response(null,{status:201})};
 await drainNotifications(db,fake,now);assert.deepEqual(sent,['https://fcm.googleapis.com/fcm/send/r']);
 await drainNotifications(db,fake,now);assert.equal(sent.length,1);
 sqlite.prepare('INSERT INTO notification_events VALUES(?,NULL,?,?,?)').run('shared','Împreună','assigned',new Date(now).toISOString());
 await drainNotifications(db,fake,now);assert.equal(sent.filter(s=>s.endsWith('/r')).length,2);assert.equal(sent.filter(s=>s.endsWith('/b')).length,1);
});
test('expired push subscriptions are removed and transient failures retry without leaking endpoints',async()=>{
 const {db,sqlite}=setup(),now=Date.now();
 sqlite.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?)').run('r','r','Roxana','https://fcm.googleapis.com/fcm/send/r','Europe/Bucharest',new Date(now-1000).toISOString());
 sqlite.prepare('INSERT INTO notification_events VALUES(?,NULL,?,?,?)').run('one','Roxana','created',new Date(now).toISOString());
 let calls=0;const fake=async()=>{calls++;return new Response(null,{status:calls===1?503:410})};
 await drainNotifications(db,fake,now);await drainNotifications(db,fake,now+1000);assert.equal(calls,1);
 await drainNotifications(db,fake,now+300001);assert.equal(calls,2);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
});
test('daily due reminders honor device timezone, owner and completed status, and are idempotent',async()=>{
 const {db,sqlite}=setup();
 for(const [id,owner] of [['r','Roxana'],['b','Bogdan']])sqlite.prepare('INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?)').run(id,id,owner,'https://fcm.googleapis.com/fcm/send/'+id,'Europe/Bucharest','2026-10-01');
 sqlite.exec("INSERT INTO tasks(area,project,title,owner,due_date,status,created_at,updated_at) VALUES('ONG','Test','Due','Roxana','2026-10-12','De făcut','now','now'),('ONG','Test','Done','Bogdan','2026-10-12','Finalizat','now','now')");
 await enqueueDueReminders(db,new Date('2026-10-12T05:00:00Z'));assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM notification_events WHERE kind='deadline'").get().n,0);
 await enqueueDueReminders(db,new Date('2026-10-12T06:00:00Z'));await enqueueDueReminders(db,new Date('2026-10-12T07:00:00Z'));
 const events=sqlite.prepare("SELECT owner FROM notification_events WHERE kind='deadline'").all();assert.deepEqual(events.map(x=>x.owner),['Roxana']);
});
test('registration cannot spoof owner or take over another account subscription; unauthenticated requests are refused',async()=>{
 const {db,sqlite}=setup(),token='a'.repeat(43),endpoint='https://fcm.googleapis.com/fcm/send/test';
 sqlite.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?)').run(await digest(token),'google:r','ivanovroxana1988@gmail.com',Date.now()+60000);
 const request=(method='POST',cookie=true)=>new Request(APP_ORIGIN+'/api/notifications',{method,headers:{origin:APP_ORIGIN,'content-type':'application/json',...(cookie?{cookie:'__Host-cc_session='+token}:{})},body:JSON.stringify({endpoint,owner:'Bogdan',user_id:'fake'})});
 assert.equal((await notificationRoute(request('POST',false),{DB:db})).status,401);
 assert.equal((await notificationRoute(request(),{DB:db})).status,200);
 assert.equal(sqlite.prepare('SELECT owner FROM push_subscriptions').get().owner,'Roxana');
 const info=await(await notificationRoute(new Request(APP_ORIGIN+'/api/notifications',{headers:{cookie:'__Host-cc_session='+token}}),{DB:db})).json();assert.equal(info.owner,'Roxana');assert.equal(info.privateKey,undefined);
 sqlite.exec("UPDATE push_subscriptions SET user_id='google:b',owner='Bogdan'");
 assert.equal((await notificationRoute(request(),{DB:db})).status,409);
});
