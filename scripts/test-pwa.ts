import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { chromium, webkit } from "@playwright/test";
import assert from "node:assert/strict";
const build = spawnSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  {
    env: {
      ...process.env,
      VITE_BASE_PATH: "/album/",
      VITE_LOCAL_DEMO: "false",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
      VITE_API_BASE_URL: "",
    },
    stdio: "inherit",
  },
);
if (build.status !== 0) process.exit(1);
const storyAssets = (
  await readdir(new URL("../dist/assets/", import.meta.url))
).filter((name) => /^StoryStudio-.*\.(js|css)$/.test(name));
const fontAssets = (
  await readdir(new URL("../dist/assets/", import.meta.url))
).filter((name) => name.endsWith(".woff2"));
assert.equal(
  storyAssets.length,
  2,
  "Story Studio must be a separate JS/CSS download",
);
assert.equal(
  fontAssets.length,
  12,
  "Complete self-hosted zine fonts must be emitted",
);
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url!, "http://127.0.0.1:4173").pathname;
  if (pathname === "/album/private.json") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end('{"private":"synthetic-test-only"}');
    return;
  }
  if (!pathname.startsWith("/album/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const path = pathname.slice(7) || "index.html";
  if (path.includes("..")) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const bytes = await readFile(new URL(`../dist/${path}`, import.meta.url));
    res.setHeader(
      "Content-Type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".webmanifest")
            ? "application/manifest+json"
            : path.endsWith(".png")
              ? "image/png"
              : path.endsWith(".woff2")
                ? "font/woff2"
                : "text/html",
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(4173, "127.0.0.1", resolve));
const browser =
  process.env.TEST_WEBKIT === "true"
    ? await webkit.launch()
    : await chromium.launch(process.env.CI ? {} : { channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(
    "http://127.0.0.1:4173/album/#/photo/11111111-1111-4111-8111-111111111111",
  );
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert.equal(await page.locator(".update-banner").count(), 0);
  await page.reload();
  assert.equal(
    await page.evaluate(() => !!navigator.serviceWorker.controller),
    true,
  );
  const manifest = await page.evaluate(
    async () => await (await fetch("manifest.webmanifest")).json(),
  );
  assert.equal(manifest.start_url, "/album/#/featured");
  assert.equal(manifest.scope, "/album/");
  await page.evaluate(async () => {
    await fetch("/album/private.json", {
      headers: { Authorization: "Bearer synthetic-test-token" },
    });
    await fetch("/album/private.json?X-Amz-Signature=synthetic");
  });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const urls: string[] = [];
    for (const key of keys)
      for (const r of await (await caches.open(key)).keys()) urls.push(r.url);
    return urls;
  });
  assert.ok(cached.length > 2);
  assert.ok(
    cached.every((u) => !u.includes("private") && !u.includes("Signature")),
  );
  assert.ok(storyAssets.every((name) => cached.some((u) => u.endsWith(name))));
  assert.ok(
    cached.some((u) => u.includes("heic-to-")) &&
      cached.some((u) => u.includes("image.worker-")),
  );
  assert.ok(
    fontAssets.every((name) => cached.some((url) => url.endsWith(name))),
    "All complete fonts must preload",
  );
  const fontName = fontAssets.find((name) => name.startsWith("smiley-"))!;
  assert.ok(
    await page.evaluate(
      async (name) => (await fetch(`/album/assets/${name}`)).ok,
      fontName,
    ),
  );
  await page.waitForFunction(
    async (name) => !!(await caches.match(`/album/assets/${name}`)),
    fontName,
  );
  await context.setOffline(true);
  assert.ok(
    await page.evaluate(
      async (name) => (await fetch(`/album/assets/${name}`)).ok,
      fontName,
    ),
  );
  for (const name of storyAssets) {
    const loaded = await page.evaluate(
      async (assetName) => (await fetch(`/album/assets/${assetName}`)).ok,
      name,
    );
    assert.ok(loaded);
  }
  await page.reload();
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  await page.getByText("当前离线，请联网后查看或上传照片。").waitFor();
  console.log(
    "PWA check passed: complete application assets and fonts preloaded, private requests excluded, offline shell available.",
  );
} finally {
  await browser.close();
  server.close();
}
