export function serviceWorkerSource(
  cache: string,
  allow: string[],
  shell: string[],
  base: string,
) {
  return `const CACHE=${JSON.stringify(cache)};
const ALLOW=new Set(${JSON.stringify(allow)});
const SHELL=${JSON.stringify(shell)};
const BASE=${JSON.stringify(base)};
let warming;
async function report(completed,total,state){
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))
    client.postMessage({type:'album-preload',completed,total,state});
}
function preload(){
  if(warming)return warming;
  warming=(async()=>{
    const cache=await caches.open(CACHE),files=[...ALLOW];let cursor=0,completed=0,failed=0;
    await report(0,files.length,'downloading');
    async function work(){while(cursor<files.length){const path=files[cursor++];let timer;try{
      let resource=await cache.match(path);
      if(!resource&&path.startsWith(BASE+'assets/'))resource=await caches.match(path);
      if(!resource){const controller=new AbortController();timer=setTimeout(()=>controller.abort(),30000);const response=await fetch(path,{signal:controller.signal});if(!response.ok||response.type==='opaque')throw new Error();resource=response;}
      if(!await cache.match(path))await cache.put(path,resource.clone());
      completed++;
    }catch{failed++;}finally{clearTimeout(timer);}await report(completed,files.length,'downloading');}}
    await Promise.all([work(),work()]);
    await report(completed,files.length,failed?'partial':'ready');
    // Keep earlier immutable assets until the new cache has copied every file.
    // Partial preloads can retry without downloading the same fonts again.
    if(!failed){const keys=await caches.keys();await Promise.all(keys.slice(0,keys.indexOf(CACHE)).filter(key=>key.startsWith('album-shell-')).map(key=>caches.delete(key)));}
  })().finally(()=>{warming=undefined;});return warming;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  // The HTML URL stays the same across releases. Never mix a cached old entry
  // with this worker's new hashed assets, then delete the old worker's cache.
  const entry=BASE+'index.html',response=await fetch(entry,{cache:'no-store'});
  if(!response.ok)throw new Error('Shell HTML unavailable');
  const html=await response.clone().text();
  const references=[...html.matchAll(/(?:src|href)="([^"]+\\/assets\\/[^"]+)"/g)].map(match=>new URL(match[1],self.location.origin).pathname);
  if(!references.length||references.some(path=>!SHELL.includes(path)))throw new Error('Shell release mismatch');
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL.filter(path=>path!==entry).map(path=>new Request(path,{cache:'reload'})));
  await cache.put(entry,response);
  // Large fonts and optional tools warm after activation via the preload
  // message. A slow optional download must not keep an update installing.
})()));
self.addEventListener('message',event=>{
  if(event.data==='activate')self.skipWaiting();
  if(event.data==='preload')event.waitUntil(preload());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search||event.request.headers.has('authorization'))return;
  if(event.request.mode==='navigate'&&url.pathname.startsWith(BASE)){
    event.respondWith(caches.open(CACHE).then(async cache=>await cache.match(BASE+'index.html')||fetch(event.request)));return;
  }
  if(!ALLOW.has(url.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const existing=await cache.match(event.request)||(url.pathname.startsWith(BASE+'assets/')?await caches.match(event.request):undefined);if(existing)return existing;
    const response=await fetch(event.request);if(response.ok&&response.type!=='opaque')await cache.put(event.request,response.clone());return response;
  }));
});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}
  event.waitUntil(self.registration.showNotification(data.title||'唯味相册',{body:data.body||'有一条新消息',icon:BASE+'icons/icon-192.png',badge:BASE+'icons/icon-192.png',data:{route:data.route||'/messages'},tag:'album-'+(data.route||'message')}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();const route=event.notification.data?.route||'/messages';const target=self.location.origin+BASE+'#'+route;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if(client.url.startsWith(self.location.origin+BASE)){await client.focus();client.navigate(target);return;}}await self.clients.openWindow(target);}));
});`;
}
