import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:8788",
  headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
test("studio saves BGM and interval and anonymous guests play both with one tap", async ({
  page,
  request,
  browser,
}, info) => {
  await request.post(`${api}/__test/reset-request-limits`);
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/stories/new");
  await page
    .getByRole("button", { name: /^选择照片 / })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: /^选择照片 / })
    .nth(1)
    .click();
  await page.getByLabel("影集名称", { exact: true }).fill("同步配乐影集");
  await page.getByRole("button", { name: "02 编排版面", exact: true }).click();
  await page.getByLabel("自动翻页间隔（秒）", { exact: true }).fill("4");
  await page.getByRole("button", { name: "03 背景音乐", exact: true }).click();
  await page.getByLabel("配乐", { exact: true }).selectOption("whenever");
  await expect(page.getByLabel("启用影集背景音乐")).toBeChecked();
  await page
    .getByRole("button", { name: "保存影集", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "影集 同步配乐影集", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).hash.split("/").at(-1)!;
  const saved = await (
    await request.get(`${api}/v1/stories/${id}`, { headers })
  ).json();
  expect(saved.zine_config.slide_seconds).toBe(4);
  expect(saved.music).toMatchObject({
    provider: "file",
    provider_track_id: "whenever",
    enabled: true,
  });
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page
    .getByRole("button", { name: "生成公开观看链接", exact: true })
    .click();
  const link = await page.getByLabel("公开观看链接").inputValue();
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const viewer = await guest.newPage();
  await viewer.clock.install({ time: new Date("2026-10-15T00:00:00Z") });
  await viewer.goto(link);
  await expect(
    viewer.getByRole("region", { name: "影集配乐", exact: true }),
  ).toBeVisible();
  await viewer.clock.pauseAt(new Date("2026-10-15T00:01:00Z"));
  await viewer.getByRole("button", { name: "播放影集", exact: true }).click();
  await expect
    .poll(() =>
      viewer.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  await viewer.clock.fastForward(3900);
  await expect(viewer.locator(".story-player-count")).toContainText("01 /");
  await viewer.clock.fastForward(150);
  await expect(viewer.locator(".story-player-count")).toContainText("02 /");
  const count = saved.zine_config.pages.length;
  for (let i = 3; i <= count; i++) {
    await viewer.clock.fastForward(4000);
    await expect(viewer.locator(".story-player-count")).toContainText(
      `${String(i).padStart(2, "0")} /`,
    );
  }
  expect(
    await viewer.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(false);
  await viewer.clock.fastForward(4000);
  await expect(
    viewer.getByRole("button", { name: "播放影集", exact: true }),
  ).toBeVisible();
  expect(
    await viewer.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(true);
  await viewer.screenshot({
    path: `.local/bgm-public-${info.project.name}.png`,
  });
  await guest.close();
  await page.getByRole("button", { name: "关闭导出窗口", exact: true }).click();
  await page.getByRole("link", { name: "编辑影集", exact: true }).click();
  await page.getByRole("button", { name: "02 编排版面", exact: true }).click();
  await expect(page.getByLabel("自动翻页间隔（秒）")).toHaveValue("4");
  await page.getByRole("button", { name: "03 背景音乐", exact: true }).click();
  await expect(page.getByLabel("配乐", { exact: true })).toHaveValue(
    "whenever",
  );
  expect((await request.delete(`${api}/v1/stories/${id}`, { headers })).ok()).toBe(true);
});
