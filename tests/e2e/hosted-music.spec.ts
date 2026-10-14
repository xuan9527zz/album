import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

test("one click starts music and timed slides with compact inline controls", async ({
  page,
  request,
}, info) => {
  const response = await request.get("/music/whenever.mp3");
  expect(response.ok()).toBe(true);
  const file = await response.body();
  expect(file.length).toBe(9970460);
  expect(createHash("sha256").update(file).digest("hex")).toBe(
    "fe0389cc5f291c1f74d8b6c6abdf48345cb530171944fad17732fd83b7301d56",
  );
  await page.clock.install({ time: new Date("2026-10-15T00:00:00Z") });
  await page.goto("/#/music-trial");
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("src", /music\/whenever\.mp3$/);
  await expect(page.locator(".music-panel")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "影集配乐", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "影集配乐", exact: true }),
  ).not.toContainText("100%");
  await page.clock.pauseAt(new Date("2026-10-15T00:01:00Z"));
  await page.getByRole("button", { name: "播放影集", exact: true }).click();
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0.25);
  const instance = await audio.elementHandle();
  await page.clock.fastForward(5900);
  await expect(page.locator(".story-player-count")).toContainText("01 /");
  await page.clock.fastForward(150);
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  expect(await audio.evaluate((a, original) => a === original, instance)).toBe(
    true,
  );
  expect(await audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
  await page.getByRole("button", { name: "静音", exact: true }).click();
  expect(await audio.evaluate((a: HTMLAudioElement) => a.muted)).toBe(true);
  await page.getByRole("button", { name: "开启声音", exact: true }).click();
  expect(await audio.evaluate((a: HTMLAudioElement) => a.muted)).toBe(false);
  await page.getByRole("button", { name: "暂停影集", exact: true }).click();
  expect(await audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  await page.clock.fastForward(13000);
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const rect = await page
    .getByRole("region", { name: "影集配乐", exact: true })
    .boundingBox();
  const footer = await page.locator(".story-player-footer").boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(footer!.y);
  await page.screenshot({
    path: `.local/compact-music-${info.project.name}.png`,
  });
});

for (const device of ["iPhone", "iPad"] as const)
  test(`${device} clicks once before media preparation and pauses both playback tracks`, async ({
    page,
  }) => {
    await page.addInitScript((kind) => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value:
          kind === "iPhone"
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      });
      Object.defineProperty(navigator, "platform", {
        configurable: true,
        value: kind === "iPad" ? "MacIntel" : "iPhone",
      });
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: 5,
      });
    }, device);
    const kinds: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/music/whenever.mp3")) kinds.push(r.resourceType());
    });
    let release!: () => void,
      routed = false;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/music/whenever.mp3", async (route) => {
      routed = true;
      await gate;
      await route.continue();
    });
    await page.goto("/#/music-trial", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "播放影集", exact: true }).click();
    if (routed) {
      await expect(page.getByLabel("音乐缓冲中")).toBeVisible();
      await page.getByRole("button", { name: "暂停影集", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.getByRole("button", { name: "播放影集", exact: true }).click();
      await page.getByRole("button", { name: "静音", exact: true }).click();
      await expect(page.getByLabel("音乐缓冲中")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "暂停影集", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "开启声音", exact: true }).click();
      await page.getByRole("button", { name: "暂停影集", exact: true }).click();
      release();
      await page.getByRole("button", { name: "播放影集", exact: true }).click();
    } else release();
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0.25);
    expect(kinds).not.toContain("fetch");
    await page.getByRole("button", { name: "暂停影集", exact: true }).click();
    expect(
      await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
    ).toBe(true);
  });
