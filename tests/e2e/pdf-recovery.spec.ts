import { expect, test, type Route } from "@playwright/test";
import { newZineConfig } from "../../packages/zine/src/model";

test("PDF export cancels stalled requests, times out, and retries without reloading", async ({
  page,
  request,
}) => {
  const api = "http://127.0.0.1:8788";
  const headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  const selected = photos
    .filter((photo: { assets: { role: string }[] }) =>
      photo.assets.some((asset) => asset.role === "preview"),
    )
    .slice(0, 2);
  const response = await request.post(`${api}/v1/stories`, {
    headers,
    data: {
      title: "导出恢复测试",
      template: "zine-diary",
      transition: "slide",
      is_shared: false,
      photo_ids: selected.map((photo: { id: string }) => photo.id),
      zine_config: newZineConfig(selected, "zine-diary"),
      music: null,
    },
  });
  expect(response.ok()).toBe(true);
  const story = await response.json();
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto(`/#/stories/${story.id}`);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const routes: Route[] = [];
  const path = `${api}/v1/stories/${story.id}`;
  await page.route(path, (route) => {
    routes.push(route);
  });
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消制作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "取消制作", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已取消制作 PDF");
  await expect(
    page.getByRole("button", { name: "制作 PDF", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("正在准备照片和字体");
  await page.clock.fastForward(31000);
  await expect(page.getByRole("alert")).toContainText("影集资料加载超时");
  await expect(
    page.getByRole("button", { name: "制作 PDF", exact: true }),
  ).toBeEnabled();
  await page.unroute(path);
  for (const route of routes) await route.abort().catch(() => {});
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  const pdf = page.getByRole("link", { name: "打开 PDF", exact: true });
  await expect(pdf).toBeVisible({ timeout: 30000 });
  const signature = await page.evaluate(
    async (url) => {
      const data = await (await fetch(url!)).arrayBuffer();
      return new TextDecoder().decode(data.slice(0, 5));
    },
    await pdf.getAttribute("href"),
  );
  expect(signature).toBe("%PDF-");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "保存 PDF", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("导出恢复测试.pdf");
  await request.delete(`${api}/v1/stories/${story.id}`, { headers });
});

test("PDF uses system fonts when a font request never completes", async ({
  page,
  request,
}) => {
  const api = "http://127.0.0.1:8788";
  const headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  const selected = photos
    .filter((photo: { assets: { role: string }[] }) =>
      photo.assets.some((asset) => asset.role === "preview"),
    )
    .slice(0, 2);
  const response = await request.post(`${api}/v1/stories`, {
    headers,
    data: {
      title: "字体加载恢复",
      template: "zine-diary",
      transition: "slide",
      is_shared: false,
      photo_ids: selected.map((photo: { id: string }) => photo.id),
      zine_config: newZineConfig(selected, "zine-diary"),
      music: null,
    },
  });
  const story = await response.json();
  const routes: Route[] = [];
  await page.route("**/*.woff2", (route) => {
    routes.push(route);
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto(`/#/stories/${story.id}`);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("正在准备影集字体…");
  await page.clock.fastForward(13000);
  await expect(
    page.getByRole("link", { name: "打开 PDF", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("status")).toContainText("本次 PDF 使用系统字体");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.unroute("**/*.woff2");
  for (const route of routes) await route.abort().catch(() => {});
  await request.delete(`${api}/v1/stories/${story.id}`, { headers });
});

test("PDF recovers after a photo stalls instead of remaining busy forever", async ({
  page,
  request,
}) => {
  const api = "http://127.0.0.1:8788";
  const headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  const selected = photos
    .filter((photo: { assets: { role: string }[] }) =>
      photo.assets.some((asset) => asset.role === "preview"),
    )
    .slice(0, 2);
  const response = await request.post(`${api}/v1/stories`, {
    headers,
    data: {
      title: "照片加载恢复",
      template: "zine-city",
      transition: "slide",
      is_shared: false,
      photo_ids: selected.map((photo: { id: string }) => photo.id),
      zine_config: newZineConfig(selected, "zine-city"),
      music: null,
    },
  });
  const story = await response.json();
  const routes: Route[] = [];
  await page.route("**/local-object/**", (route) => {
    routes.push(route);
  });
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto(`/#/stories/${story.id}`);
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("正在制作 PDF");
  await page.clock.fastForward(31000);
  await expect(page.getByRole("alert")).toContainText("照片下载超时");
  await expect(
    page.getByRole("button", { name: "关闭导出窗口" }),
  ).toBeEnabled();
  await page.unroute("**/local-object/**");
  for (const route of routes) await route.abort().catch(() => {});
  await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "打开 PDF", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await request.delete(`${api}/v1/stories/${story.id}`, { headers });
});
