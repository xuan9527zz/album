import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { chromium, webkit, expect } from "@playwright/test";
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
const programAssets = (
  await readdir(new URL("../dist/assets/", import.meta.url))
).filter((name) => /\.(js|css|woff2)$/.test(name));
assert.ok(programAssets.length > 20, `Program assets ${programAssets.length}`);
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
let workerOverride = "",
  staleEntry = false;
let fontRequests = 0;
let slowFontRequests = 0,
  retryRequests = 0;
const streaming = new Set<ReturnType<typeof setInterval>>();
const heldResources = new Set<import("node:http").ServerResponse>();
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url!, "http://127.0.0.1:4173").pathname;
  if (pathname === "/album/assets/preload-slow-font.woff2") {
    slowFontRequests++;
    res.setHeader("Content-Type", "font/woff2");
    res.setHeader("Content-Length", 16 * 32768);
    let chunks = 0;
    const timer = setInterval(() => {
      res.write(Buffer.alloc(32768, 1));
      if (++chunks === 16) res.end();
    }, 320);
    streaming.add(timer);
    res.on("close", () => {
      clearInterval(timer);
      streaming.delete(timer);
    });
    return;
  }
  if (pathname === "/album/assets/preload-retry.js") {
    res.setHeader("Content-Type", "text/javascript");
    if (++retryRequests === 1) {
      res.setHeader("Content-Length", 1024);
      res.write("/* first attempt stalls */");
      heldResources.add(res);
      res.on("close", () => heldResources.delete(res));
    } else res.end("/* recovered optional tool */");
    return;
  }
  if (pathname.endsWith(".woff2")) fontRequests++;
  if (pathname === "/album/assets/slow-extra.js") {
    heldResources.add(res);
    res.on("close", () => heldResources.delete(res));
    return;
  }
  if (pathname === "/album/sw.js" && workerOverride) {
    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "no-store");
    res.end(workerOverride);
    return;
  }
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
    let bytes = await readFile(new URL(`../dist/${path}`, import.meta.url));
    if (staleEntry && path === "index.html")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            /\/album\/assets\/index-[^" ]+\.js/,
            "/album/assets/retired-entry.js",
          ),
      );
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
await page.addInitScript(() => {
  (window as any).__preloadMessages = [];
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "album-preload")
      (window as any).__preloadMessages.push(event.data);
  });
});
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
  await expect
    .poll(
      () =>
        page.evaluate(async (files) => {
          const matches = await Promise.all(
            files.map((name) => caches.match(`/album/assets/${name}`)),
          );
          return matches.every(Boolean);
        }, programAssets),
      { timeout: 30000 },
    )
    .toBe(true);
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
  await expect
    .poll(() =>
      page.evaluate(
        async (name) => !!(await caches.match(`/album/assets/${name}`)),
        fontName,
      ),
    )
    .toBe(true);
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
  await context.setOffline(false);
  const fontsBeforeUpgrade = fontRequests;
  const previousCache = await page.evaluate(
    async () => (await caches.keys())[0],
  );
  const source = await readFile(
    new URL("../dist/sw.js", import.meta.url),
    "utf8",
  );
  workerOverride = source.replace(
    /const CACHE="[^"]+";/,
    'const CACHE="album-shell-stale-upgrade-test";',
  );
  staleEntry = true;
  const rejected = await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    const result = new Promise<string>((resolve) => {
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing!;
          worker.addEventListener("statechange", () => {
            if (["redundant", "installed"].includes(worker.state))
              resolve(worker.state);
          });
        },
        { once: true },
      );
    });
    await registration.update();
    return result;
  });
  assert.equal(
    rejected,
    "redundant",
    "An inconsistent HTML release must not replace the working shell",
  );
  await page.reload();
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  assert.equal(await page.locator(".update-banner").count(), 0);
  staleEntry = false;
  workerOverride = source
    .replace(
      /const CACHE="[^"]+";/,
      'const CACHE="album-shell-consistent-upgrade-test";',
    )
    .replace(
      "let warming,snapshot;",
      'ALLOW.add(BASE+"assets/slow-extra.js");let warming,snapshot;',
    );
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())!.update(),
  );
  await page
    .getByRole("button", { name: "新版本已准备好 · 点击刷新", exact: true })
    .waitFor();
  // Mimic an older export dialog that is stuck and cannot close: the update
  // prompt must still be visible and clickable above its backdrop.
  await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.className = "story-export-backdrop";
    dialog.style.cssText =
      "position:fixed;inset:0;z-index:180;background:#0006";
    document.body.append(dialog);
  });
  await Promise.all([
    page.waitForEvent("framenavigated"),
    page
      .getByRole("button", { name: "新版本已准备好 · 点击刷新", exact: true })
      .click(),
  ]);
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).includes("album-shell-consistent-upgrade-test"),
      ),
    )
    .toBe(true);
  const upgraded = await page.evaluate(async () => ({
    keys: await caches.keys(),
    html: await (await (
      await caches.open("album-shell-consistent-upgrade-test")
    ).match("/album/index.html"))!.text(),
  }));
  assert.ok(!upgraded.html.includes("retired-entry"));
  assert.ok(!upgraded.keys.includes("album-shell-stale-upgrade-test"));
  await page.waitForFunction(
    () => document.querySelector(".update-banner") === null,
  );
  await expect
    .poll(() => heldResources.size, { timeout: 30000 })
    .toBeGreaterThan(0);
  assert.equal(fontRequests, fontsBeforeUpgrade, "Upgrade reuses cached fonts");
  assert.ok(upgraded.keys.includes(previousCache));
  // A newer worker may already be installing when the active preload ends.
  await page.evaluate(() => caches.open("album-shell-future-install-test"));
  await page.reload();
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  for (const response of heldResources) {
    response.setHeader("Content-Type", "text/javascript");
    response.end("/* synthetic optional resource */");
  }
  await expect
    .poll(() =>
      page.evaluate(
        async (name) => (await caches.keys()).includes(name),
        previousCache,
      ),
    )
    .toBe(false);
  assert.ok(
    await page.evaluate(async () =>
      (await caches.keys()).includes("album-shell-future-install-test"),
    ),
  );
  console.log(
    "PWA upgrade check passed: stale HTML rejected, update accessible above a modal, stalled optional resources do not block activation.",
  );
  const total =
    JSON.parse(source.match(/const ALLOW=new Set\((\[[^;]+\])\);/)![1]).length +
    2;
  workerOverride = source
    .replace(
      /const CACHE="[^"]+";/,
      'const CACHE="album-shell-resumable-test";',
    )
    .replace("45000", "2500")
    .replace("600000", "20000")
    .replace(
      "let warming,snapshot;",
      'ALLOW.add(BASE+"assets/preload-slow-font.woff2");ALLOW.add(BASE+"assets/preload-retry.js");RESOURCES[BASE+"assets/preload-slow-font.woff2"]={label:"影集中文测试字体",bytes:524288};let warming,snapshot;',
    );
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration())!.update(),
  );
  await page
    .getByRole("button", { name: "新版本已准备好 · 点击刷新", exact: true })
    .waitFor();
  await Promise.all([
    page.waitForEvent("framenavigated"),
    page
      .getByRole("button", { name: "新版本已准备好 · 点击刷新", exact: true })
      .click(),
  ]);
  await page.getByText("相册尚未配置", { exact: true }).waitFor();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as any).__preloadMessages.some((m: any) =>
            m.downloads?.some(
              (d: any) =>
                d.label === "影集中文测试字体" &&
                d.loaded > 0 &&
                d.loaded < d.total,
            ),
          ),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          (expected) =>
            (window as any).__preloadMessages.some(
              (m: any) =>
                m.total === expected &&
                m.state === "partial" &&
                m.completed === expected - 1,
            ),
          total,
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(
          (expected) =>
            (window as any).__preloadMessages.some(
              (m: any) =>
                m.total === expected &&
                m.state === "ready" &&
                m.completed === expected,
            ),
          total,
        ),
      { timeout: 35000 },
    )
    .toBe(true);
  assert.equal(
    slowFontRequests,
    1,
    "A progressing download survives beyond its idle timeout and is not repeated",
  );
  assert.equal(
    retryRequests,
    2,
    "A stalled resource retries automatically without reopening",
  );
  await context.setOffline(true);
  await page.evaluate(async () =>
    (await caches.open("album-shell-resumable-test")).delete(
      "/album/assets/preload-retry.js",
    ),
  );
  await context.setOffline(false);
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            !!(await (
              await caches.open("album-shell-resumable-test")
            ).match("/album/assets/preload-retry.js")),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  assert.equal(
    slowFontRequests,
    1,
    "Going back online preserves completed files",
  );
  assert.equal(
    retryRequests,
    3,
    "Going back online immediately resumes missing files",
  );
  await page.evaluate(async () => {
    await (
      await caches.open("album-shell-resumable-test")
    ).delete("/album/assets/preload-retry.js");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            !!(await (
              await caches.open("album-shell-resumable-test")
            ).match("/album/assets/preload-retry.js")),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  assert.equal(
    retryRequests,
    4,
    "Returning to the foreground resumes missing files",
  );
  assert.equal(
    slowFontRequests,
    1,
    "Foreground rechecks preserve complete resources",
  );
  console.log(
    "PWA recovery check passed: live byte progress, slow streams preserved, stalled downloads retry automatically, online resumes missing files.",
  );
} finally {
  await browser.close();
  for (const timer of streaming) clearInterval(timer);
  for (const response of heldResources) response.destroy();
  server.close();
}
