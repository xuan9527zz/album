import { expect, test } from "@playwright/test";

test("builds, plays, edits, and deletes a private animated story", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto("/#/stories/new");
  await expect(
    page.getByRole("heading", { name: "制作一本影集" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "选择照片 示例风景-0", exact: true })
    .click();
  await page
    .getByRole("button", { name: "选择照片 示例风景-1", exact: true })
    .click();
  await page.getByLabel("影集名称").fill("东京旅行");
  await page.getByRole("button", { name: "黑色影院" }).click();
  await page.getByRole("button", { name: "柔和淡入" }).click();
  await expect(page.getByLabel("与家人共享影集")).toBeDisabled();
  await page.getByRole("button", { name: "保存影集" }).first().click();
  await expect(
    page.getByRole("region", { name: "影集 东京旅行" }),
  ).toBeVisible();
  await expect(
    page.locator(".story-player-image.story-motion-fade"),
  ).toBeVisible();
  await expect(page.locator(".story-player-count")).toHaveText("01 / 02");
  await expect(page.locator(".story-player-image img")).toBeVisible();
  await page.waitForTimeout(900);
  await page.screenshot({
    path: `.local/story-player-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.locator(".story-player-count")).toHaveText("02 / 02");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".story-player-count")).toHaveText("01 / 02");
  await page.getByRole("link", { name: "编辑影集" }).click();
  await expect(page.getByRole("heading", { name: "编辑影集" })).toBeVisible();
  await page.getByRole("button", { name: "后移 示例风景-0" }).click();
  await page.getByRole("button", { name: "横向切换" }).click();
  await page.getByRole("button", { name: "保存修改" }).first().click();
  await expect(
    page.locator(".story-player-image.story-motion-slide"),
  ).toBeVisible();
  await expect(page.locator(".story-player-meta h1")).toHaveText("东京旅行");
  await page.getByRole("link", { name: "编辑影集" }).click();
  await page.getByRole("button", { name: "删除影集" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("heading", { name: "我的影集" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "东京旅行" })).toHaveCount(0);
});
