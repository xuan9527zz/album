import type { Plugin } from "vite";
import { createHash } from "node:crypto";
export function pwaPlugin(base: string, name: string): Plugin {
  return {
    name: "album-private-shell",
    transformIndexHtml(html) {
      return html.replace(
        "</head>",
        `<link rel="manifest" href="${base}manifest.webmanifest"/></head>`,
      );
    },
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle);
      const version = createHash("sha256")
        .update(names.join("|"))
        .digest("hex")
        .slice(0, 14);
      const allow = [
        ...names,
        "index.html",
        "manifest.webmanifest",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png",
        "icons/apple-touch-icon.png",
      ]
        .filter(
          (n) => /\.(js|css|html|png)$/.test(n) || n.endsWith("webmanifest"),
        )
        .map((n) => base + n);
      const shellFiles = new Set<string>();
      const addStaticChunk = (name: string) => {
        if (shellFiles.has(name)) return;
        const output = bundle[name];
        if (!output || output.type !== "chunk") return;
        shellFiles.add(name);
        for (const imported of output.imports) addStaticChunk(imported);
        for (const css of output.viteMetadata?.importedCss ?? [])
          shellFiles.add(css);
      };
      for (const name of names) {
        const output = bundle[name];
        if (output.type === "chunk" && output.isEntry) addStaticChunk(name);
      }
      const shell = [
        base + "index.html",
        ...[...shellFiles].map((name) => base + name),
        base + "manifest.webmanifest",
        base + "icons/icon-192.png",
      ];
      const warm = names
        .filter((name) => /^assets\/StoryStudio-.*\.(js|css)$/.test(name))
        .map((name) => base + name);
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: JSON.stringify({
          id: base,
          name,
          short_name: name,
          start_url: `${base}#/featured`,
          scope: base,
          display: "standalone",
          background_color: "#f5f3ed",
          theme_color: "#f5f3ed",
          lang: "zh-CN",
          icons: [
            {
              src: `${base}icons/icon-192.png`,
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: `${base}icons/icon-512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: `${base}icons/icon-maskable-512.png`,
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        }),
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const CACHE='album-shell-${version}';const ALLOW=new Set(${JSON.stringify(allow)});const SHELL=${JSON.stringify(shell)};const WARM=${JSON.stringify(warm)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(async c=>{await c.addAll(SHELL);await Promise.all(WARM.map(u=>c.add(u).catch(()=>{})));})));self.addEventListener('message',e=>{if(e.data==='activate')self.skipWaiting();});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('album-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||e.request.headers.has('authorization'))return;if(e.request.mode==='navigate'&&u.pathname.startsWith(${JSON.stringify(base)})){e.respondWith(fetch(e.request).catch(()=>caches.match(${JSON.stringify(base + "index.html")})));return;}if(!ALLOW.has(u.pathname))return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;const r=await fetch(e.request);if(r.ok&&r.type!=='opaque')await c.put(e.request,r.clone());return r;}));});self.addEventListener('push',e=>{let data={};try{data=e.data?.json()||{};}catch{}e.waitUntil(self.registration.showNotification(data.title||'唯味相册',{body:data.body||'有一条新消息',icon:${JSON.stringify(base + "icons/icon-192.png")},badge:${JSON.stringify(base + "icons/icon-192.png")},data:{route:data.route||'/messages'},tag:'album-'+(data.route||'message')}));});self.addEventListener('notificationclick',e=>{e.notification.close();const route=e.notification.data?.route||'/messages';const target=self.location.origin+${JSON.stringify(base)}+'#'+route;e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if(client.url.startsWith(self.location.origin+${JSON.stringify(base)})){await client.focus();client.navigate(target);return;}}await self.clients.openWindow(target);}));});`,
      });
    },
  };
}
