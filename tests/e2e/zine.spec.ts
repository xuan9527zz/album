import { expect, test } from "@playwright/test";

const token = "demo:11111111-1111-4111-8111-111111111111";
const api = "http://127.0.0.1:8788";

test("edits fixed zine pages, saves manual text, reads live metadata and loads local fonts", async ({
  page,
  request,
}, testInfo) => {
  await request.post(`${api}/__test/reset-request-limits`);
  const fontRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(".woff2")) fontRequests.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/stories/new");
  for (const n of [0, 1, 2])
    await page
      .getByRole("button", { name: `选择照片 示例风景-${n}`, exact: true })
      .click();
  const name = "雨天行记";
  await page.getByLabel("影集名称").fill(name);
  await page.getByRole("button", { name: "02 编排版面", exact: true }).click();

  // All three themes and their four fixed layouts use the same editor/renderer.
  for (const theme of [
    "途中 · 城市采样",
    "余日 · 旧日游记",
    "潮汐 · 海岸档案",
  ]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    const choices = await page
      .getByLabel("这一页的排版")
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value),
      );
    expect(choices).toHaveLength(4);
    for (const layout of choices) {
      await page.getByLabel("这一页的排版").selectOption(layout);
      await expect(page.locator(".zine-editor .zine-canvas")).toBeVisible();
      await expect(page.locator(".zine-photo img").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
  }
  await page
    .getByRole("button", { name: "余日 · 旧日游记", exact: true })
    .click();
  await page.getByLabel("这一页的排版").selectOption("diary-opening");

  const manual = "今天沿着海岸慢慢走。\n把风声留在这一页。";
  await page.getByLabel("序言", { exact: true }).fill(manual);
  await page
    .getByRole("button", { name: "途中 · 城市采样", exact: true })
    .click();
  await page
    .getByRole("button", { name: "余日 · 旧日游记", exact: true })
    .click();
  await expect(page.getByLabel("序言", { exact: true })).toHaveValue(manual);
  await expect(page.getByLabel("自动照片资料")).toContainText("沿着海岸走走");
  await expect(page.locator(".zine-editor .zine-canvas")).toContainText(
    "示例风景-0",
  );
  await page.locator(".zine-editor").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `.local/zine-editor-${testInfo.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "保存影集", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: `影集 ${name}`, exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).hash.split("/").at(-1)!;
  const details = await request.get(`${api}/v1/stories/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(details.ok()).toBe(true);
  const saved = await details.json();
  expect(saved.zine_config.pages[0].texts.intro).toBe(manual);
  expect(JSON.stringify(saved.zine_config)).not.toContain("沿着海岸走走");

  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      document.fonts.check('24px "ZineHuiwen"', "旅途"),
    ),
  ).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(
    fontRequests.every(
      (url) => new URL(url).origin === "http://127.0.0.1:5173",
    ),
  ).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({
    path: `.local/zine-player-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "播放影集", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停影集", exact: true }),
  ).toBeVisible();
  await page.getByText("查看文字与照片资料", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "播放影集", exact: true }),
  ).toBeVisible();
  await page.getByText("查看文字与照片资料", { exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  const steps = saved.zine_config.pages.length;
  await expect(page.locator(".story-player-count")).toHaveText(
    `02 / ${String(steps).padStart(2, "0")}`,
  );
  await expect(page.locator(".zine-slide-in .zine-view-spread")).toBeVisible();

  // A subsequent photo edit updates the automatic text without changing the stored layout.
  const photo = saved.photos.find(
    (p: { title: string }) => p.title === "示例风景-0",
  );
  const updated = await request.patch(`${api}/v1/photos/${photo.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "海边的傍晚",
      captured_local: "2026-10-12T17:36:00",
      location_label: "镰仓 · 七里滨",
    },
  });
  expect(updated.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".zine-canvas")).toContainText("海边的傍晚");
  await expect(page.locator(".zine-canvas")).toContainText("镰仓 · 七里滨");
  await expect(page.locator(".zine-canvas")).toContainText("2026.10.12 17:36");
  await page.getByRole("link", { name: "编辑影集", exact: true }).click();
  await page.getByRole("button", { name: "02 编排版面", exact: true }).click();
  await expect(page.getByLabel("序言", { exact: true })).toHaveValue(manual);
  await page
    .getByLabel("序言", { exact: true })
    .fill('<img src=x onerror="alert(1)">');
  await expect(page.locator(".zine-editor .zine-canvas")).toContainText(
    '<img src=x onerror="alert(1)">',
  );
  await expect(page.locator(".zine-text img")).toHaveCount(0);
  await page.getByRole("button", { name: "删除影集", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的影集", exact: true }),
  ).toBeVisible();
  // Restore the shared test fixture so existing story tests remain independent.
  const restored = await request.patch(`${api}/v1/photos/${photo.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: "示例风景-0",
      captured_local: "2026-10-11T16:24:00",
      location_label: "沿着海岸走走",
    },
  });
  expect(restored.ok()).toBe(true);
});
