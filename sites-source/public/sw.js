const OFFLINE_CACHE='cc-public-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add('/offline.html')).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('cc-public-offline-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
// Never cache authenticated pages, API responses or attached documents.
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
