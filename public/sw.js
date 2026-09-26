const CACHE='su-aqtau-public-v2';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/icon.svg','/manifest.webmanifest'])));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('su-aqtau-public-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!['/icon.svg','/manifest.webmanifest'].includes(url.pathname))return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
