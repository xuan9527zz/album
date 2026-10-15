import { test, expect } from "@playwright/test";

test("whole-spread reader fits portrait and landscape, keeps page jumping, and wraps both directions", async ({
  page,
}, info) => {
  await page.goto("/#/music-trial");
  await expect(page.getByLabel("影集页码", { exact: true })).toBeVisible();
  await expect(
    page.getByText("查看文字与照片资料", { exact: true }),
  ).toHaveCount(0);
  for (const size of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const box = (s: string) =>
            document.querySelector(s)!.getBoundingClientRect();
          const f = box(
              ".zine-player-turn:not([aria-hidden=true]) .zine-frame",
            ),
            h = box(".story-player-header"),
            b = box(".story-player-footer");
          return (
            f.width > 100 &&
            Math.abs(f.width / f.height - 1.5) < 0.01 &&
            f.left >= -1 &&
            f.right <= innerWidth + 1 &&
            f.top >= h.bottom - 1 &&
            f.bottom <= b.top + 1 &&
            b.bottom <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      )
      .toBe(true);
    await expect(page.getByLabel("影集页码", { exact: true })).toBeInViewport();
    if (size.width === 844)
      await page.screenshot({
        path: `.local/zine-landscape-${info.project.name}.png`,
      });
  }
  const select = page.getByLabel("影集页码", { exact: true });
  const total = await select.locator("option").count();
  await select.selectOption(String(total - 1));
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(select).toHaveValue("0");
  await page.getByRole("button", { name: "上一页", exact: true }).click();
  await expect(select).toHaveValue(String(total - 1));
  await select.selectOption("0");
  await expect(select).toHaveValue("0");
});
