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

for (const device of ["iPhone", "iPad"] as const) {
  test(`${device} starts with native audio and permits playback before media is ready`, async ({
    page,
  }, testInfo) => {
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
    await page.clock.install();
    const kinds: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/music/whenever.mp3"))
        kinds.push(request.resourceType());
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/music/whenever.mp3", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/#/music-trial", { waitUntil: "domcontentloaded" });
    const player = page.getByRole("region", {
      name: "文件音乐播放器",
      exact: true,
    });
    await expect(
      player.getByRole("button", { name: "播放配乐", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("audio")).toHaveAttribute(
      "src",
      /\/music\/whenever\.mp3$/,
    );
    await expect(player.getByRole("status")).toHaveText("点击播放即可开始");
    await page.clock.fastForward(16000);
    await expect(player.getByRole("alert")).toHaveCount(0);
    await expect(
      player.getByRole("button", { name: "播放配乐", exact: true }),
    ).toBeEnabled();
    const canInterceptMedia =
      testInfo.project.name !== "webkit" || process.platform !== "win32";
    if (canInterceptMedia) {
      await player
        .getByRole("button", { name: "播放配乐", exact: true })
        .click();
      await expect(player.getByRole("status")).toHaveText("正在缓冲音乐…");
      await player
        .getByRole("button", { name: "暂停配乐", exact: true })
        .click();
      await expect(player.getByRole("alert")).toHaveCount(0);
    }
    release();
    await player.getByRole("button", { name: "播放配乐", exact: true }).click();
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeGreaterThan(0.25);
    await expect(player.getByRole("status")).toHaveText("在线播放已就绪");
    await expect(player.getByRole("progressbar")).toHaveCount(0);
    await expect(player).not.toContainText("100%");
    await expect(player).not.toContainText("0 B");
    await expect(
      player.getByRole("button", { name: "尝试兼容播放", exact: true }),
    ).toHaveCount(0);
    if (canInterceptMedia) expect(kinds).toContain("media");
    expect(kinds).not.toContain("fetch");
    const element = await page.locator("audio").elementHandle();
    await player
      .getByRole("button", { name: "收起配乐面板", exact: true })
      .click();
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.locator(".story-player-count")).toContainText("02 /");
    expect(
      await page.locator("audio").evaluate((a, old) => a === old, element),
    ).toBe(true);
    expect(
      await page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
    ).toBe(false);
    await player
      .getByRole("button", { name: "展开配乐面板", exact: true })
      .click();
    await player.getByRole("button", { name: "暂停配乐", exact: true }).click();
    await player.getByRole("button", { name: "关闭配乐", exact: true }).click();
    await expect(page.locator("audio")).toHaveCount(0);
    expect(await element!.evaluate((a: HTMLAudioElement) => a.paused)).toBe(
      true,
    );
    await page.getByRole("button", { name: "加载配乐", exact: true }).click();
    await expect(page.locator("audio")).toHaveAttribute(
      "src",
      /\/music\/whenever\.mp3$/,
    );
  });
}

test("falls back automatically when downloaded Blob media cannot be decoded", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value) =>
      create(
        value instanceof Blob && value.type.startsWith("audio/")
          ? new Blob(["invalid music"], { type: "audio/mpeg" })
          : value,
      );
  });
  await page.goto("/#/music-trial");
  const player = page.getByRole("region", {
    name: "文件音乐播放器",
    exact: true,
  });
  await expect(player.getByRole("status")).toHaveText("在线播放已就绪");
  await expect(page.locator("audio")).toHaveAttribute(
    "src",
    /\/music\/whenever\.mp3$/,
  );
  await expect(player.getByRole("alert")).toHaveCount(0);
  await player.getByRole("button", { name: "播放配乐", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  await player.getByRole("button", { name: "暂停配乐", exact: true }).click();
});
