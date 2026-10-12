const OFFLINE_CACHE='cc-public-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add('/offline.html')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cc-public-offline-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Never cache authenticated pages, API responses or attached documents.
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});

self.addEventListener('push',event=>{
 event.waitUntil(self.registration.showNotification('Command Center',{
  body:'Ai un task nou atribuit sau un termen care te privește. Deschide aplicația pentru detalii.',
  icon:'/icons/app-192.png',badge:'/icons/app-192.png',tag:'command-center-update',renotify:true,data:{url:'/'},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const existing=clients.find(client=>new URL(client.url).origin===self.location.origin);
  if(existing){await existing.navigate('/');return existing.focus()}
  return self.clients.openWindow('/');
 }));
});
