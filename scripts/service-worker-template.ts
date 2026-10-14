export function serviceWorkerSource(
  cache: string,
  allow: string[],
  shell: string[],
  base: string,
  resources: Record<string, { label: string; bytes: number }> = {},
) {
  return `const CACHE=${JSON.stringify(cache)};
const ALLOW=new Set(${JSON.stringify(allow)});
const SHELL=${JSON.stringify(shell)};
const BASE=${JSON.stringify(base)};
const RESOURCES=${JSON.stringify(resources)};
let warming,snapshot;
let sending=Promise.resolve();
const active=new Map();
function broadcast(value){
  sending=sending.then(async()=>{for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage(value);}).catch(()=>{});return sending;
}
function report(completed,total,state){
  snapshot={type:'album-preload',completed,total,state,downloads:[...active.values()].map(item=>({...item}))};
  return broadcast(snapshot);
}
function preload(){
  if(warming){if(snapshot)void broadcast(snapshot);return warming;}
  warming=(async()=>{
    const cache=await caches.open(CACHE),files=[...ALLOW],missing=[];let cursor=0,completed=0,failed=0,storage=false,lastReport=0;
    for(const path of files){if(await cache.match(path))completed++;else missing.push(path);}
    const notify=()=>report(completed,files.length,'downloading');
    const heartbeat=setInterval(()=>void notify(),5000);
    await notify();
    async function work(){while(cursor<missing.length){const path=missing[cursor++];let idle,deadline;const controller=new AbortController();try{
      const info=RESOURCES[path]||{label:path.endsWith('.woff2')?'影集字体':'程序资源',bytes:0};
      const progress={label:info.label,loaded:0,total:info.bytes};active.set(path,progress);await notify();
      let resource=path.startsWith(BASE+'assets/')?await caches.match(path):undefined;
      if(resource){await cache.put(path,resource);completed++;continue;}
      const resetIdle=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),45000);};
      const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Resource download stalled')),{once:true}));
      resetIdle();deadline=setTimeout(()=>controller.abort(),600000);
      await Promise.race([aborted,(async()=>{
        const response=await fetch(path,{signal:controller.signal});
        if(!response.ok||response.type==='opaque'||!response.body)throw new Error('Resource unavailable');
        progress.total=info.bytes||Number(response.headers.get('content-length'))||0;
        const reader=response.body.getReader();
        const body=new ReadableStream({
          async pull(target){try{const part=await reader.read();if(part.done){target.close();return;}resetIdle();progress.loaded+=part.value.byteLength;target.enqueue(part.value);
            if(Date.now()-lastReport>1000){lastReport=Date.now();void notify();}
          }catch(error){target.error(error);}},
          cancel(reason){return reader.cancel(reason);}
        });
        // Fetch exposes decoded bytes. Do not retain encoded transfer headers
        // on the new response stored in CacheStorage.
        const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
        await cache.put(path,new Response(body,{status:response.status,statusText:response.statusText,headers}));
        if(controller.signal.aborted)throw new Error('Resource download stalled');
      })()]);
      completed++;
    }catch(error){failed++;if(error?.name==='QuotaExceededError')storage=true;}finally{clearTimeout(idle);clearTimeout(deadline);controller.abort();active.delete(path);await notify();}}}
    try{await Promise.all([work(),work()]);}finally{clearInterval(heartbeat);}
    if(storage){snapshot={type:'album-preload',completed,total:files.length,state:'partial',downloads:[],storage:true};await broadcast(snapshot);return;}
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
