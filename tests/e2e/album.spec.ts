import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
test("login, upload, original download, edit, feature, delete, and account isolation", async ({
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
  await page.getByRole("button", { name: "编辑日期与地点" }).click();
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
  await expect(page.locator(".photo-card")).toHaveCount(1);
  await page.locator(".photo-card").click();
  await expect(page.getByText("家庭成员可见")).toBeVisible();
  await expect(page.getByRole("button", { name: "删除照片", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "编辑日期与地点" })).toHaveCount(0);
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
  await page
    .getByRole("link", { name: `打开照片 专属回忆-${testInfo.project.name}` })
    .click();
  await page.getByRole("button", { name: "移出共享相册" }).click();
  await page.getByRole("button", { name: "删除照片", exact: true }).click();
  await page.getByRole("button", { name: "确认永久删除" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(`专属回忆-${testInfo.project.name}`)).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});
test("iPhone offers the original image to the Photos share sheet", async ({ page }) => {
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
  await expect
    .poll(async () => {
      if (await page.evaluate(() => (window as any).__sharedFile)) return "shared";
      if (await page.getByText(/文件已准备好，请再点一次/).count()) return "prepared";
      return "working";
    })
    .not.toBe("working");
  if (!(await page.evaluate(() => (window as any).__sharedFile)))
    await saveButton.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__sharedFile))
    .toEqual({
      name: "landscape-0.png",
      type: "image/png",
      size: (await readFile(path.resolve("tests/fixtures/landscape-0.png"))).length,
    });
  await expect(page.getByRole("link", { name: /下载原件到文件/ })).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  await saveButton.click();
  await expect(page.getByText(/此格式无法通过系统菜单保存到照片/)).toBeVisible();
  await expect(saveButton).toHaveCount(0);
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
