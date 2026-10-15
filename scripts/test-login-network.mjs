import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const site = "http://127.0.0.1:5174",
  primary = "http://127.0.0.1:8799",
  backup = "https://family-album-api.xuan1996wyx.workers.dev";
const id = "11111111-1111-4111-8111-111111111111";
const jwt = [
  btoa(JSON.stringify({ alg: "none" })),
  btoa(
    JSON.stringify({
      iss: primary + "/auth/v1",
      sub: id,
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ),
  "synthetic",
].join(".");
// Exercise the real login form and SDK, outside the demo-login shortcut.
// No local credentials or real account requests are loaded by this server.
const server = await createServer({
  configFile: false,
  envDir: false,
  root: fileURLToPath(new URL("../apps/web", import.meta.url)),
  cacheDir: fileURLToPath(
    new URL("../node_modules/.vite-login-network", import.meta.url),
  ),
  plugins: [react()],
  define: {
    "import.meta.env.VITE_LOCAL_DEMO": JSON.stringify("false"),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(primary),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      "synthetic-publishable-key",
    ),
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(primary + "/api"),
  },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
await server.listen();
try {
  for (const [kind, engine, options] of [
    ["chrome", chromium, process.env.CI ? {} : { channel: "chrome" }],
    ["webkit", webkit, {}],
  ]) {
    const browser = await engine.launch(options);
    try {
      for (const mode of ["fallback", "invalid", "offline"]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        let backupTokens = 0,
          backupPhotos = 0;
        const cors = {
          "Access-Control-Allow-Origin": site,
          "Access-Control-Allow-Headers":
            "apikey,Authorization,Content-Type,X-Client-Info,X-Supabase-Api-Version",
          "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
          "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
          "X-Supabase-Api-Version": "2024-01-01",
        };
        await page.route(primary + "/**", async (route) => {
          if (mode === "invalid" && route.request().method() === "OPTIONS")
            return route.fulfill({ status: 204, headers: cors });
          if (
            mode === "invalid" &&
            route.request().url().includes("/auth/v1/token")
          )
            return route.fulfill({
              status: 400,
              contentType: "application/json",
              headers: cors,
              body: JSON.stringify({
                code: "invalid_credentials",
                message: "Invalid login credentials",
              }),
            });
          return route.abort("connectionfailed");
        });
        await page.route(backup + "/**", async (route) => {
          if (mode === "offline") return route.abort("connectionfailed");
          const request = route.request(),
            path = new URL(request.url()).pathname;
          if (request.method() === "OPTIONS")
            return route.fulfill({ status: 204, headers: cors });
          let result;
          if (path === "/auth/v1/token") {
            backupTokens++;
            result = {
              access_token: jwt,
              refresh_token: "synthetic-refresh",
              token_type: "bearer",
              expires_in: 3600,
              user: {
                id,
                aud: "authenticated",
                email: "test@example.com",
                created_at: new Date().toISOString(),
              },
            };
          } else if (path === "/v1/me")
            result = { display_name: "连接测试", id, avatar_data_url: null };
          else if (path === "/v1/photos") {
            backupPhotos++;
            result = { photos: [], urls: [], next_cursor: null };
          } else if (path === "/v1/notifications")
            result = { unread_count: 0, notifications: [] };
          else if (path === "/auth/v1/user")
            result = { id, aud: "authenticated", email: "test@example.com" };
          else result = { status: "ok" };
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: cors,
            body: JSON.stringify(result),
          });
        });
        await page.route("**/manifest.webmanifest?connection-check=1", (r) =>
          r.fulfill({
            status: 200,
            contentType: "application/manifest+json",
            body: "{}",
          }),
        );
        await page.goto(site);
        await page.getByLabel("邮箱", { exact: true }).fill("test@example.com");
        await page
          .getByLabel("密码", { exact: true })
          .fill("synthetic-password");
        await page
          .getByRole("button", { name: "进入我的相册", exact: true })
          .click();
        if (mode === "fallback") {
          await expect(
            page.getByRole("heading", {
              name: "往事总在回忆时被赋予意义",
              exact: true,
            }),
          ).toBeVisible();
          await expect.poll(() => backupPhotos).toBeGreaterThan(0);
          expect(backupTokens).toBe(1);
          const before = backupPhotos;
          await page.reload();
          await expect(
            page.getByRole("heading", {
              name: "往事总在回忆时被赋予意义",
              exact: true,
            }),
          ).toBeVisible();
          await expect.poll(() => backupPhotos).toBeGreaterThan(before);
        } else if (mode === "invalid") {
          await expect(page.getByRole("alert")).toContainText(
            "邮箱或相册密码不正确",
          );
          expect(backupTokens).toBe(0);
        } else {
          await expect(page.getByRole("alert")).toContainText(
            "暂时连接不到登录服务",
          );
          await page
            .getByRole("link", { name: "检查登录连接", exact: true })
            .click();
          await expect(page.getByLabel("连接检查结果")).toHaveValue(
            /备用线路: FETCH_FAILED/,
          );
          await expect(page.getByLabel("连接检查结果")).not.toHaveValue(
            /synthetic-password|test@example.com/,
          );
        }
        await page.screenshot({ path: `.local/login-${mode}-${kind}.png` });
        console.log(
          JSON.stringify({
            engine: kind,
            mode,
            passed: true,
            backupTokens,
            backupPhotos,
          }),
        );
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
