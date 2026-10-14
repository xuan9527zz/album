import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("anonymous music trial embeds the hosted MP3 and keeps its player across slides", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/music/whenever.mp3");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("audio/mpeg");
  const file = await response.body();
  expect(file.length).toBe(9970460);
  expect(createHash("sha256").update(file).digest("hex")).toBe(
    "fe0389cc5f291c1f74d8b6c6abdf48345cb530171944fad17732fd83b7301d56",
  );
  let businessRequests = 0,
    audioRequests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/v1/")) businessRequests++;
    if (r.url().includes("/music/whenever.mp3")) audioRequests++;
  });
  await page.goto("/#/music-trial");
  const player = page.getByRole("region", {
    name: "文件音乐播放器",
    exact: true,
  });
  if (testInfo.project.name === "webkit" && process.platform === "win32") {
    await expect(player.getByRole("alert")).toContainText("音乐文件无法播放");
    await player
      .getByRole("button", { name: "尝试兼容播放", exact: true })
      .click();
    await expect(player.getByRole("status")).toHaveText("在线播放已就绪", {
      timeout: 15000,
    });
    await expect(player.getByRole("status")).not.toContainText("100%");
  } else
    await expect(player.getByRole("status")).toHaveText("100% · 音乐准备完成", {
      timeout: 15000,
    });
  await player.getByRole("button", { name: "播放配乐", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  const before = await page.locator("audio").elementHandle();
  await player
    .getByRole("button", { name: "收起配乐面板", exact: true })
    .click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  expect(
    await page.locator("audio").evaluate((a, old) => a === old, before),
  ).toBe(true);
  expect(
    await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
  ).toBe(false);
  if (testInfo.project.name !== "webkit" || process.platform !== "win32")
    expect(audioRequests).toBe(1);
  expect(businessRequests).toBe(0);
  await player
    .getByRole("button", { name: "展开配乐面板", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `.local/hosted-music-${testInfo.project.name}.png`,
  });
  await player.getByRole("button", { name: "暂停配乐", exact: true }).click();
});
