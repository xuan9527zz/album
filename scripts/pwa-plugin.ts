import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { serviceWorkerSource } from "./service-worker-template.ts";
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
          (n) =>
            /\.(js|css|html|png|woff2)$/.test(n) || n.endsWith("webmanifest"),
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
        source: serviceWorkerSource(
          "album-shell-" + version,
          allow,
          shell,
          base,
        ),
      });
    },
  };
}
