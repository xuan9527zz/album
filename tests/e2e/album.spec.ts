import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
test.beforeEach(async ({ request }) => {
  const response = await request.post("http://127.0.0.1:8788/__test/reset-request-limits");
  expect(response.status()).toBe(204);
});
test("login, upload, original download, edit, batch, trash, restore, and account isolation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("本地演示 · 合成图片 · 未连接云服务"),
  ).toBeVisible();
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await expect(
    page.getByRole("heading", { name: "往事总在回忆时被赋予意义" }),
  ).toBeVisible();
  await expect(page.locator(".photo-card img")).toHaveCount(8);
  await expect
    .poll(() =>
      page
        .locator(".photo-card img")
        .evaluateAll(
          (images) =>
            images.length === 8 &&
            images.every(
              (i) =>
                (i as HTMLImageElement).complete &&
                (i as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({
    path: `.local/gallery-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.goto("/#/upload");
  await page
    .locator(".upload-panel input[type=file]")
    .nth(1)
    .setInputFiles(path.resolve("tests/fixtures/landscape-0.png"));
  await expect(page.getByAltText(/待上传预览 landscape-0.png/)).toBeVisible();
  await page.getByLabel("标题").first().fill(`专属回忆-${testInfo.project.name}`);
  await page.getByLabel("上传后放入精选").check();
  await page.getByRole("button", { name: "开始保存" }).click();
  await expect(page.getByText("原件与浏览图片已保存").last()).toBeVisible({
    timeout: 35000,
  });
  await page.goto("/#/all");
  await page.locator(".photo-card").first().click();
  await expect(page.getByRole("dialog", { name: "照片详情" })).toBeVisible();
  if (testInfo.project.name === "webkit")
    await page.getByRole("button", { name: /下载原件 · 准备下载/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /下载原件/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("landscape-0.png");
  expect(await readFile(await download.path())).toEqual(
    await readFile(path.resolve("tests/fixtures/landscape-0.png")),
  );
  await page.getByRole("button", { name: "编辑标题、时间和地点" }).click();
  await page
    .getByLabel("地点", { exact: true })
    .fill(`专属回忆-${testInfo.project.name}`);
  await page.getByLabel("拍摄时间（当地时间）").fill("2026-10-12T10:30");
  await page.getByRole("button", { name: "保存信息" }).click();
  await expect(
    page.getByRole("heading", { name: `专属回忆-${testInfo.project.name}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "已放入精选" })).toBeVisible();
  await page.getByRole("button", { name: "已放入精选" }).click();
  await expect(
    page.getByRole("button", { name: "放入精选", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-image.zoom")).toHaveCount(0);
  await page.locator(".detail-image img").click();
  await expect(page.locator(".detail-image.zoom")).toHaveCount(0);
  await page.getByRole("button", { name: "放入共享相册" }).click();
  await expect(page.getByRole("button", { name: "移出共享相册" })).toBeVisible();
  await page.screenshot({
    path: `.local/detail-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭照片" }).click();
  await page.goto("/#/me");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "家人二的示例账号" }).click();
  await page.goto("/#/all");
  await expect(page.locator(".photo-card")).toHaveCount(3);
  await expect(page.getByText(`专属回忆-${testInfo.project.name}`)).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator(".photo-card")).toHaveCount(3);
  await page.goto("/#/shared");
  await expect(page.getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` })).toBeVisible();
  await page.getByLabel("筛选上传成员").selectOption("22222222-2222-4222-8222-222222222222");
  await expect(page.locator(".photo-card")).toHaveCount(0);
  await page.getByLabel("筛选上传成员").selectOption("11111111-1111-4111-8111-111111111111");
  await expect(page.getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` })).toBeVisible();
  await page.getByRole("button", { name: "批量管理" }).click();
  await expect(page.getByRole("button", { name: `选择照片 专属回忆-${testInfo.project.name}` })).toBeDisabled();
  await page.getByRole("button", { name: "完成选择" }).click();
  await page.getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` }).click();
  await expect(page.getByText("家庭成员可见")).toBeVisible();
  await expect(page.getByRole("button", { name: "删除照片", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑标题、时间和地点" })).toHaveCount(0);
  await page.getByRole("button", { name: "关闭照片" }).click();
  await page.goto("/#/me");
  await expect(page.getByLabel("显示昵称")).toHaveCount(0);
  await page.getByRole("button", { name: "设置资料" }).click();
  await page.getByLabel("显示昵称").fill("未保存的昵称");
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByLabel("显示昵称")).toHaveCount(0);
  await page.getByRole("button", { name: "设置资料" }).click();
  await page.getByLabel("显示昵称").fill("Janice");
  await page.locator(".profile-edit input[type=file]").setInputFiles(path.resolve("tests/fixtures/landscape-0.png"));
  await page.getByRole("button", { name: "保存资料" }).click();
  await expect(page.getByLabel("显示昵称")).toHaveCount(0);
  await expect(page.locator(".my-profile h2")).toHaveText("Janice");
  await expect(page.locator(".my-profile .avatar img")).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/all");
  await page.getByRole("button", { name: "批量管理" }).click();
  await page.getByRole("button", { name: `选择照片 专属回忆-${testInfo.project.name}` }).click();
  await page.getByRole("button", { name: "移出共享" }).click();
  await expect(page.getByRole("button", { name: "批量管理" })).toBeVisible();
  await page
    .getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` })
    .click();
  await expect(page.getByRole("button", { name: "放入共享相册" })).toBeVisible();
  await page.getByRole("button", { name: "删除照片", exact: true }).click();
  await page.getByRole("button", { name: "移入最近删除" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`专属回忆-${testInfo.project.name}`)).toHaveCount(
    0,
  );
  await page.goto("/#/me");
  await page.getByRole("link", { name: /最近删除/ }).click();
  await expect(page.getByRole("heading", { name: "最近删除" })).toBeVisible();
  await expect(page.getByText(`专属回忆-${testInfo.project.name}`)).toBeVisible();
  await page.screenshot({ path: `.local/trash-${testInfo.project.name}.png` });
  const trashCard = page.locator(".trash-card", { hasText: `专属回忆-${testInfo.project.name}` });
  await trashCard.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(trashCard).toHaveCount(0);
  await page.goto("/#/all");
  await expect(page.getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` })).toBeVisible();
  await page.getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` }).click();
  await page.getByRole("button", { name: "删除照片", exact: true }).click();
  await page.getByRole("button", { name: "移入最近删除" }).click();
  await expect(page.getByRole("dialog", { name: "照片详情" })).toHaveCount(0);
  await page.goto("/#/trash");
  const purgeCard = page.locator(".trash-card", { hasText: `专属回忆-${testInfo.project.name}` });
  await purgeCard.getByRole("button", { name: "永久删除", exact: true }).click();
  await purgeCard.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page.getByText(`专属回忆-${testInfo.project.name}`)).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("year, month, and location search reaches the whole album", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/all");
  await page.getByLabel("筛选年份").selectOption("2026");
  await page.getByLabel("筛选月份").selectOption("9");
  await page.getByLabel("筛选地点").fill("远方的山");
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await expect(page.locator(".photo-card")).toContainText("示例风景-10");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect.poll(() => page.locator(".photo-card").count()).toBeGreaterThanOrEqual(12);
});
test("family likes, comments, messages, and personal featured stay separate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/all");
  const sharedHref = await page.getByRole("link", { name: "打开照片 示例风景-0" }).getAttribute("href");
  const sharedID = sharedHref!.split("/")[2];
  await page.getByRole("link", { name: "打开照片 示例风景-0" }).click();
  await expect(page.getByRole("button", { name: /放入共享相册|移出共享相册/ })).toBeVisible();
  if (await page.getByRole("button", { name: "放入共享相册" }).isVisible())
    await page.getByRole("button", { name: "放入共享相册" }).click();
  await expect(page.getByRole("button", { name: "移出共享相册" })).toBeVisible();
  await page.getByRole("button", { name: "关闭照片" }).click();
  await page.goto("/#/me");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "家人二的示例账号" }).click();
  await page.goto("/#/shared");
  await page.locator(`.photo-card[href='#/photo/${sharedID}/shared']`).click();
  await expect(page.getByRole("button", { name: /点赞并加入我的精选|已点赞 · 已加入我的精选/ })).toBeVisible();
  if (await page.getByRole("button", { name: /已点赞 · 已加入我的精选/ }).isVisible())
    await page.getByRole("button", { name: /已点赞 · 已加入我的精选/ }).click();
  await page.getByRole("button", { name: /点赞并加入我的精选/ }).click();
  await expect(page.getByRole("button", { name: /已点赞 · 已加入我的精选/ })).toBeVisible();
  await page.getByLabel("写评论").fill("真好看");
  await page.getByRole("button", { name: "发布评论" }).click();
  await page.getByRole("button", { name: "关闭照片" }).click();
  await page.goto("/#/featured");
  await expect(page.locator(`.photo-card[href='#/photo/${sharedID}/featured']`)).toBeVisible();
  await page.goto("/#/messages");
  await page.locator("#chat-message").fill("周末一起看照片");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("周末一起看照片").last()).toBeVisible();
  await page.goto("/#/me");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/messages");
  await expect(page.getByText(/赞了你的共享照片/).first()).toBeVisible();
  await expect(page.getByText(/评论了你的共享照片/).first()).toBeVisible();
  await expect(page.getByText("周末一起看照片").first()).toBeVisible();
  await expect(page.locator(".bottom-nav a[href='#/upload']")).toHaveCount(0);
  await expect(page.locator(".topbar a[href='#/upload']")).toHaveCount(1);
  await page.goto("/#/all");
  await page.locator(`.photo-card[href='#/photo/${sharedID}/all']`).click();
  await page.getByRole("button", { name: "移出共享相册" }).click();
  await expect(page.getByRole("button", { name: "放入共享相册" })).toBeVisible();
});
test("photo detail swipes left to the previous image and right to the next", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/all");
  await expect.poll(() => page.locator(".photo-card").count()).toBeGreaterThanOrEqual(3);
  const cards = await page.locator(".photo-card").evaluateAll((items) =>
    items.slice(0, 3).map((item) => item.getAttribute("href")),
  );
  await page.locator(".photo-card").nth(1).click();
  expect(new URL(page.url()).hash).toBe(cards[1]);
  async function swipe(from: number, to: number) {
    await page.locator(".detail-image").evaluate((element, points) => {
      // WebKit does not expose a constructible Touch, but React only reads changedTouches.
      for (const [type, x] of [["touchstart", points.from], ["touchend", points.to]] as const) {
        const event = new Event(type, { bubbles: true });
        Object.defineProperty(event, "changedTouches", { value: [{ clientX: x, clientY: 240 }] });
        element.dispatchEvent(event);
      }
    }, { from, to });
  }
  if (testInfo.project.name === "desktop-chrome") {
    await page.getByRole("button", { name: "上一张照片" }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe(cards[0]);
    await page.getByRole("button", { name: "下一张照片" }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe(cards[1]);
  } else {
    await swipe(280, 80);
    await expect.poll(() => new URL(page.url()).hash).toBe(cards[0]);
    await expect(page.getByRole("button", { name: "上一张照片" })).toHaveCount(0);
    await swipe(80, 280);
    await expect.poll(() => new URL(page.url()).hash).toBe(cards[1]);
  }
});
test("iPhone opens a save popup with the original image and a share fallback", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: ({ files }: ShareData) => Boolean(files?.length),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files }: ShareData) => {
        const file = files![0];
        (window as any).__sharedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
        };
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/upload");
  await page
    .locator(".upload-panel input[type=file]")
    .nth(1)
    .setInputFiles(path.resolve("tests/fixtures/landscape-0.png"));
  await page.getByRole("button", { name: "开始保存" }).click();
  await expect(page.getByText("原件与浏览图片已保存").last()).toBeVisible({
    timeout: 35000,
  });
  await page.goto("/#/all");
  await page.locator(".photo-card").first().click();
  const saveButton = page.getByRole("button", { name: /保存到照片/ });
  await expect(saveButton).toBeVisible();
  await expect(page.getByRole("link", { name: /下载原件到文件/ })).toHaveCount(0);
  await saveButton.click();
  const popup = page.getByRole("dialog", { name: "保存到照片" });
  await expect(popup).toBeVisible();
  await expect(popup.getByText("长按图片，再选“存储图像”。")).toBeVisible();
  await expect
    .poll(() => popup.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__sharedFile)).toBeUndefined();
  await page.screenshot({ path: `.local/save-popup-${testInfo.project.name}.png` });
  await popup.getByRole("button", { name: "关闭保存弹窗" }).click();
  await expect(popup).toHaveCount(0);
  await saveButton.click();
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "改用系统菜单保存" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__sharedFile))
    .toEqual({
      name: "landscape-0.png",
      type: "image/png",
      size: (await readFile(path.resolve("tests/fixtures/landscape-0.png"))).length,
    });
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  await popup.getByRole("button", { name: "改用系统菜单保存" }).click();
  await expect(popup.getByText(/此格式无法通过系统菜单保存/)).toBeVisible();
  await expect(popup.getByRole("button", { name: "改用系统菜单保存" })).toHaveCount(0);
  await popup.getByRole("button", { name: "关闭保存弹窗" }).click();
  await expect(page.getByRole("link", { name: /下载原件到文件/ })).toBeVisible();
});
test("HEIC original and manually grouped MP4 remain downloadable", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.TEST_HEIC,
    "Synthetic HEIC fixture generation is optional",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/upload");
  await page
    .locator(".upload-panel input[type=file]")
    .nth(1)
    .setInputFiles(path.resolve("tests/fixtures/synthetic.heic"));
  await page.getByRole("button", { name: "开始保存" }).click();
  await expect(page.getByText("原件与浏览图片已保存").last()).toBeVisible({
    timeout: 40000,
  });
  await page.goto("/#/all");
  await page.locator(".photo-card").first().click();
  if (testInfo.project.name === "webkit")
    await page.getByRole("button", { name: /下载原件 · 准备下载/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /下载原件/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("synthetic.heic");
  expect(await readFile(await download.path())).toEqual(
    await readFile(path.resolve("tests/fixtures/synthetic.heic")),
  );
  await expect(page.locator(".detail-image img")).toBeVisible();
  await page.getByRole("button", { name: "添加配套视频" }).click();
  await page
    .locator('input[accept=".mov,.mp4"]')
    .setInputFiles(path.resolve("tests/fixtures/synthetic.mp4"));
  await expect(page.getByText(/手动组合，保存后标记/)).toBeVisible();
  await page.getByRole("button", { name: "确认组合并保存" }).click();
  await expect(
    page.getByText("配套视频已保存 · 手动组合，尚未验证Live配对"),
  ).toBeVisible();
  if (testInfo.project.name === "webkit")
    await page
      .getByRole("button", { name: /下载配套视频 · 准备下载/ })
      .click();
  const [videoDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /下载配套视频/ }).click(),
  ]);
  expect(videoDownload.suggestedFilename()).toBe("synthetic.mp4");
  expect(await readFile(await videoDownload.path())).toEqual(
    await readFile(path.resolve("tests/fixtures/synthetic.mp4")),
  );
});
