import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const api = "http://127.0.0.1:8788",
  headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };

test("uploads an MP3 with progress, saves it to a story and public viewer, and stops at expiry", async ({
  page,
  request,
  browser,
}, info) => {
  await request.post(`${api}/__test/reset-request-limits`);
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/stories/new");
  for (const n of [0, 1])
    await page
      .getByRole("button", { name: `选择照片 示例风景-${n}`, exact: true })
      .click();
  await page.getByLabel("影集名称", { exact: true }).fill("上传配乐影集");
  await page.getByRole("button", { name: "03 背景音乐", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "上传 MP3", exact: true }),
  ).toBeEnabled();
  const upload = page.waitForResponse(
    (r) => r.url().endsWith("/v1/music/uploads") && r.status() === 201,
  );
  await page
    .getByLabel("上传 MP3 文件", { exact: true })
    .setInputFiles("apps/web/public/music/whenever.mp3");
  await expect(
    page.getByRole("progressbar", { name: "MP3 上传进度" }),
  ).toBeVisible();
  const track = await (await upload).json();
  await expect(page.getByLabel("配乐", { exact: true })).toHaveValue(track.id);
  await expect(
    page.getByRole("progressbar", { name: "MP3 上传进度" }),
  ).toHaveJSProperty("value", 100);
  await expect(page.getByLabel("启用影集背景音乐")).toBeChecked();
  await page.screenshot({ path: `.local/mp3-upload-${info.project.name}.png` });
  let storyID = "";
  try {
    await page
      .getByRole("button", { name: "保存影集", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("region", { name: "影集 上传配乐影集", exact: true }),
    ).toBeVisible();
    storyID = new URL(page.url()).hash.split("/").at(-1)!;
    const saved = await (
      await request.get(`${api}/v1/stories/${storyID}`, { headers })
    ).json();
    expect(saved.music.provider_track_id).toBe(track.id);
    expect(saved.music.expired).toBe(false);
    const musicPath = `${api}/v1/music/${track.id}/stream`;
    const source = await request.get(musicPath);
    expect(source.ok()).toBe(true);
    expect(
      createHash("sha256")
        .update(await source.body())
        .digest("hex"),
    ).toBe(
      createHash("sha256")
        .update(await readFile("apps/web/public/music/whenever.mp3"))
        .digest("hex"),
    );
    await page.getByRole("button", { name: "播放影集", exact: true }).click();
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0.25);
    await page.getByRole("button", { name: "暂停影集", exact: true }).click();
    const share = await (
      await request.post(`${api}/v1/stories/${storyID}/share`, {
        headers,
        data: {},
      })
    ).json();
    const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      const viewer = await guest.newPage();
      const start = Date.now();
      await viewer.clock.install({ time: new Date(start) });
      await viewer.goto(`http://127.0.0.1:5173/#/watch/${share.token}`);
      await expect(
        viewer.getByRole("button", { name: "播放影集", exact: true }),
      ).toBeVisible();
      await viewer.clock.pauseAt(new Date(start + 60000));
      await viewer
        .getByRole("button", { name: "播放影集", exact: true })
        .click();
      await expect
        .poll(() =>
          viewer
            .locator("audio")
            .evaluate((a: HTMLAudioElement) => a.currentTime),
        )
        .toBeGreaterThan(0.25);
      await viewer.clock.fastForward(72 * 3600000);
      await expect(viewer.getByRole("alert")).toContainText("配乐已过期");
      expect(
        await viewer
          .locator("audio")
          .evaluate((a: HTMLAudioElement) => a.paused),
      ).toBe(true);
      await viewer
        .getByRole("button", { name: "播放影集", exact: true })
        .click();
      await expect(
        viewer.getByRole("button", { name: "暂停影集", exact: true }),
      ).toBeVisible();
      await request.post(`${api}/__test/music-expire/${track.id}`);
      expect((await request.get(musicPath)).status()).toBe(410);
      await viewer.clock.resume();
      await viewer.reload();
      await expect(
        viewer.getByRole("region", { name: "影集 上传配乐影集", exact: true }),
      ).toBeVisible();
      await expect(viewer.getByRole("alert")).toContainText("配乐已过期");
    } finally {
      await guest.close();
    }
  } finally {
    if (storyID)
      await request.delete(`${api}/v1/stories/${storyID}`, { headers });
    await request.post(`${api}/__test/music-expire/${track.id}`);
  }
});
