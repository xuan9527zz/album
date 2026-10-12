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
      const shell = [
        base + "index.html",
        ...names
          .filter(
            (n) =>
              n.endsWith(".css") ||
              (bundle[n].type === "chunk" && bundle[n].isEntry),
          )
          .map((n) => base + n),
        base + "manifest.webmanifest",
        base + "icons/icon-192.png",
      ];
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
        source: `const CACHE='album-shell-${version}';const ALLOW=new Set(${JSON.stringify(allow)});const SHELL=${JSON.stringify(shell)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));self.addEventListener('message',e=>{if(e.data==='activate')self.skipWaiting();});self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('album-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.search||e.request.headers.has('authorization'))return;if(e.request.mode==='navigate'&&u.pathname.startsWith(${JSON.stringify(base)})){e.respondWith(fetch(e.request).catch(()=>caches.match(${JSON.stringify(base + "index.html")})));return;}if(!ALLOW.has(u.pathname))return;e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;const r=await fetch(e.request);if(r.ok&&r.type!=='opaque')await c.put(e.request,r.clone());return r;}));});`,
      });
    },
  };
}
