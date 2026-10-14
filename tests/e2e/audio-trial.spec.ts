import {
  expect,
  test,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { newZineConfig } from "../../packages/zine/src/model";

const api = "http://127.0.0.1:8788";
const headers = {
  Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
};
async function openTrial(page: Page, request: APIRequestContext, mode = "1") {
  await request.post(`${api}/__test/reset-request-limits`);
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  const selected = photos
    .filter((p: any) => p.assets.some((a: any) => a.role === "preview"))
    .slice(0, 3);
  const response = await request.post(`${api}/v1/stories`, {
    headers,
    data: {
      title: "音乐连续播放试验",
      template: "zine-diary",
      transition: "slide",
      is_shared: false,
      photo_ids: selected.map((p: any) => p.id),
      zine_config: newZineConfig(selected, "zine-diary"),
      music: null,
    },
  });
  expect(response.ok()).toBe(true);
  const story = await response.json();
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto(`/?musicTrial=${mode}#/stories/${story.id}`);
  return story.id as string;
}

test("prepares the entire audio file and keeps playback while turning pages and offline", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "webkit" && process.platform === "win32",
    "This Windows WebKit runtime plays HTTP MP3 but rejects Blob media; real iPhone verification is still required.",
  );
  let downloads = 0;
  page.on("request", (r) => {
    if (r.url().includes("/__music-trial/audio")) downloads++;
  });
  const id = await openTrial(page, request);
  const player = page.getByRole("region", { name: "文件音乐播放器" });
  await expect(player.getByRole("status")).toHaveText("100% · 音乐准备完成");
  expect(await page.locator("audio").getAttribute("src")).toMatch(/^blob:/);
  expect(
    await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(true);
  await page.getByRole("button", { name: "播放配乐", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  const media = await page.locator("audio").elementHandle();
  const source = await page.locator("audio").getAttribute("src");
  await page.getByRole("button", { name: "收起配乐面板", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  expect(
    await page.locator("audio").evaluate((a, before) => a === before, media),
  ).toBe(true);
  expect(await page.locator("audio").getAttribute("src")).toBe(source);
  expect(
    await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(false);
  await page.context().setOffline(true);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.6);
  await page.getByRole("button", { name: "展开配乐面板", exact: true }).click();
  await page.screenshot({
    path: `.local/audio-trial-${testInfo.project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "静音观看", exact: true }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  expect(await media!.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  expect(downloads).toBe(1);
  await page.context().setOffline(false);
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});

test("times out stalled music, retries, and can cancel without blocking the album", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "webkit" && process.platform === "win32",
    "This Windows WebKit runtime cannot decode Blob media; keep the error/skip flow covered separately.",
  );
  await page.clock.install();
  const id = await openTrial(page, request, "stall");
  await expect(page.getByRole("status")).toContainText("音乐准备中");
  await page.clock.fastForward(46000);
  await expect(page.getByRole("alert")).toContainText("音乐加载停滞");
  await page.getByRole("button", { name: "重试音乐加载", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("100% · 音乐准备完成");
  await page.getByRole("button", { name: "关闭配乐", exact: true }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});

test("does not report 100 percent when fully downloaded bytes cannot be played", async ({
  page,
  request,
}) => {
  // Serve invalid bytes to both fetch and the platform's native media stack;
  // Windows WebKit media requests do not pass through Playwright routing.
  const id = await openTrial(page, request, "invalid");
  await expect(page.getByRole("alert")).toContainText("音乐文件无法播放");
  await expect(page.getByRole("status")).not.toContainText("100%");
  await page.getByRole("button", { name: "静音观看", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});
