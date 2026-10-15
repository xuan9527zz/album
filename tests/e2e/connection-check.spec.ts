import { expect, test } from "@playwright/test";
test("connection check separates an Auth connection failure from healthy API routes and can retry", async ({
  page,
}, info) => {
  let recovered = false;
  await page.route("**/manifest.webmanifest?connection-check=1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/manifest+json",
      body: "{}",
    }),
  );
  await page.route("http://127.0.0.1:8788/**", async (route) => {
    if (!route.request().url().endsWith("/health")) return route.continue();
    if (route.request().url().includes("/auth/v1/") && !recovered)
      return route.abort("connectionfailed");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Headers": "apikey",
      },
      body: '{"status":"ok"}',
    });
  });
  await page.goto("/#/connection-check");
  const report = page.getByLabel("连接检查结果", { exact: true });
  await expect(report).toBeVisible();
  await expect(report).toHaveValue(/登录服务: FETCH_FAILED/);
  await expect(report).toHaveValue(/相册接口: HTTP_200/);
  await expect(report).toHaveValue(/备用线路: HTTP_200/);
  await expect(report).toHaveValue(/网站资源: HTTP_200/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/connection-check-${info.project.name}.png`,
  });
  recovered = true;
  await page.getByRole("button", { name: "重新检查", exact: true }).click();
  await expect(report).toHaveValue(/登录服务: HTTP_200/);
  await expect(
    page.getByText("连接检查通过，可以返回登录后重试。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "欢迎回来", exact: true }),
  ).toBeVisible();
});
