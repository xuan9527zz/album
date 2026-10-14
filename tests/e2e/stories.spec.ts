import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("creates new templates, keeps music across horizontal turns, exports PDF and revocable public links", async ({
  page,
  browser,
}, testInfo) => {
  let musicRequests = 0;
  await page.route("https://music.163.com/outchain/player**", async (route) => {
    musicRequests++;
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><button>播放测试</button>",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/stories/new");
  await expect(
    page.getByRole("heading", { name: "制作一本影集" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "黑色影院", exact: true }),
  ).toHaveCount(0);
  for (const n of [0, 1])
    await page
      .getByRole("button", { name: `选择照片 示例风景-${n}`, exact: true })
      .click();
  await page.getByLabel("影集名称", { exact: true }).fill("横向旅行影集");
  await page.getByRole("button", { name: "02 编排版面", exact: true }).click();
  await page.getByLabel("背景颜色代码").fill("#DCE8DE");
  await page.getByRole("button", { name: "滑动与淡入", exact: true }).click();
  await page.getByRole("button", { name: "03 背景音乐", exact: true }).click();
  await page.getByLabel("配乐", {exact:true}).selectOption("link");
  await page
    .getByLabel("歌曲链接")
    .fill("https://music.163.com/#/song?id=186016");
  await page.getByLabel("启用影集背景音乐").check();
  await page.getByLabel("曲名", { exact: true }).fill("旅行配乐");
  expect(musicRequests).toBe(0);
  await page
    .getByRole("button", { name: "保存影集", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "影集 横向旅行影集", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".zine-canvas")).toHaveCSS(
    "background-color",
    "rgb(220, 232, 222)",
  );
  await page.getByRole("button", { name: "开启音乐", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(1);
  await page
    .locator("iframe")
    .evaluate((element) => element.setAttribute("data-instance", "original"));
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".zine-slide-in.zine-effect-fade")).toBeVisible();
  await expect(page.locator('iframe[data-instance="original"]')).toHaveCount(1);
  expect(musicRequests).toBe(1);
  await page
    .getByRole("button", { name: "收起面板（音乐可能仍在播放）" })
    .click();
  await page.getByRole("button", { name: "展开音乐面板" }).click();
  await expect(page.locator('iframe[data-instance="original"]')).toHaveCount(1);
  await page.getByRole("button", { name: "关闭音乐", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".zine-slide-out")).toHaveCount(0);
  await page.screenshot({
    path: `.local/reader-new-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("button", { name: "生成公开观看链接" }).click();
  const link = await page.getByLabel("公开观看链接").inputValue();
  const guest = await browser.newContext();
  const viewer = await guest.newPage();
  await viewer.goto(link);
  await expect(
    viewer.getByRole("region", { name: "影集 横向旅行影集", exact: true }),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "我的示例相册" }),
  ).toHaveCount(0);
  await expect(viewer.locator(".zine-photo img").first()).toBeVisible();
  await page.getByRole("button", { name: "关闭观看链接", exact: true }).click();
  await viewer.reload();
  await expect(
    viewer.getByRole("heading", { name: "影集暂时无法打开" }),
  ).toBeVisible();
  await guest.close();
  if (testInfo.project.name === "desktop-chrome") {
    await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
    const pdf = page.getByRole("link", { name: "打开 PDF", exact: true });
    await expect(pdf).toBeVisible({ timeout: 45000 });
    const bytes = await page.evaluate(
      async (url) =>
        Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
      await pdf.getAttribute("href"),
    );
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(".local/story-export.pdf", Buffer.from(bytes));
  }
  await page.getByRole("button", { name: "关闭导出窗口" }).click();
  await page.getByRole("link", { name: "编辑影集", exact: true }).click();
  await page.getByRole("button", { name: "删除影集", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "我的影集", exact: true }),
  ).toBeVisible();
});
