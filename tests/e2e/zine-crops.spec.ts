import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const api = "http://127.0.0.1:8788";
const headers = {
  Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
};
const other = {
  Authorization: "Bearer demo:22222222-2222-4222-8222-222222222222",
};

test("uses family photos and saves pinch and drag framing in whole spreads", async ({
  page,
  request,
}, info) => {
  await request.post(`${api}/__test/reset-request-limits`);
  const borrowed = (
    await (await request.get(`${api}/v1/photos`, { headers: other })).json()
  ).photos.slice(0, 2);
  for (const p of borrowed)
    expect(
      (
        await request.post(`${api}/v1/photos/${p.id}/share`, {
          headers: other,
          data: { is_shared: true },
        })
      ).ok(),
    ).toBe(true);
  let id = "";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "我的示例相册" }).click();
    await page.goto("/#/shared");
    await page.getByRole("link", { name: "制作影集", exact: true }).click();
    await expect(page.locator(".story-source-tabs button.active")).toHaveText(
      "共享照片",
    );
    for (const p of borrowed)
      await page.locator(`[data-photo-id="${p.id}"]`).click();
    await page.getByLabel("影集名称", { exact: true }).fill("跨页取景测试");
    await page
      .getByRole("button", { name: "02 编排版面", exact: true })
      .click();
    await page
      .getByRole("button", { name: "余日 · 旧日游记", exact: true })
      .click();
    const frame = page
      .locator('.zine-editor [data-photo-slot="0"] .zine-photo-adjustable')
      .first();
    await frame.scrollIntoViewIfNeeded();
    await expect(frame.locator("img")).toBeVisible();
    await expect
      .poll(() =>
        frame
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    const rect = (await frame.boundingBox())!;
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    const touch = (type: string, coords: number[][]) =>
      frame.evaluate((target, data) => {
        // Supply explicit TouchList coordinates consistently across test engines.
        const event = new Event(data.type, { bubbles: true, cancelable: true });
        const touches = data.coords.map(([clientX,clientY], i) => ({ identifier:i+1, clientX, clientY, target }));
        Object.defineProperty(event, "touches", {value:touches});
        Object.defineProperty(event, "changedTouches", {value:touches});
        target.dispatchEvent(event);
      }, { type, coords });
    await touch("touchstart", [
      [x - 12, y],
      [x + 12, y],
    ]);
    await touch("touchmove", [
      [x - 24, y],
      [x + 24, y],
    ]);
    await touch("touchend", []);
    await expect.poll(async () => Number(await page.getByLabel("照片位置 1 缩放", {exact:true}).inputValue())).toBeCloseTo(2, 1);
    if (info.project.name === "desktop-chrome") {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + rect.width * 0.12, y + rect.height * 0.08, {
        steps: 3,
      });
      await page.mouse.up();
    } else {
      await touch("touchstart", [[x, y]]);
      await touch("touchmove", [
        [x + rect.width * 0.12, y + rect.height * 0.08],
      ]);
      await touch("touchend", []);
    }
    await page.screenshot({
      path: `.local/crop-editor-${info.project.name}.png`,
    });
    await page
      .getByRole("button", { name: "保存影集", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("region", { name: "影集 跨页取景测试", exact: true }),
    ).toBeVisible();
    id = new URL(page.url()).hash.split("/").at(-1)!;
    const saved = await (
      await request.get(`${api}/v1/stories/${id}`, { headers })
    ).json();
    expect(saved.photos.map((p: any) => p.id)).toEqual(
      borrowed.map((p: any) => p.id),
    );
    const crop = saved.zine_config.pages[0].photo_crops[0];
    expect(crop.zoom).toBeCloseTo(2, 1);
    expect(Math.abs(crop.x) + Math.abs(crop.y)).toBeGreaterThan(0.05);
    await expect(
      page.locator(
        ".zine-player-turn:not([aria-hidden=true]) .zine-view-spread",
      ),
    ).toBeVisible();
    await expect(
      page.locator(".zine-player-turn:not([aria-hidden=true]) .zine-canvas"),
    ).toContainText("01");
    await expect(
      page.locator(".zine-player-turn:not([aria-hidden=true]) .zine-canvas"),
    ).toContainText("02");
    await expect(page.locator(".story-player-count")).toHaveText("01 / 02");
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page.locator(".story-player-count")).toHaveText("02 / 02");
    await expect(
      page.locator(".zine-player-turn:not([aria-hidden=true]) .zine-canvas"),
    ).toContainText("03");
    await expect(
      page.locator(".zine-player-turn:not([aria-hidden=true]) .zine-canvas"),
    ).toContainText("04");
    await page.getByRole("button", { name: "上一页", exact: true }).click();
    await expect(page.locator(".zine-slide-out")).toHaveCount(0);
    await page.screenshot({
      path: `.local/crop-reader-${info.project.name}.png`,
    });
    if (info.project.name === "desktop-chrome") {
      await page.getByRole("button", { name: "导出", exact: true }).click();
      await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
      const pdf = page.getByRole("link", { name: "打开 PDF", exact: true });
      await expect(pdf).toBeVisible({ timeout: 45000 });
      const bytes = await page.evaluate(
        async (url) =>
          Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
        await pdf.getAttribute("href"),
      );
      await writeFile(".local/crop-story.pdf", Buffer.from(bytes));
      await page
        .getByRole("button", { name: "关闭导出窗口", exact: true })
        .click();
    }
    await page.getByRole("link", { name: "编辑影集", exact: true }).click();
    await page
      .getByRole("button", { name: "02 编排版面", exact: true })
      .click();
    expect(
      Number(
        await page.getByLabel("照片位置 1 缩放", { exact: true }).inputValue(),
      ),
    ).toBeCloseTo(2, 1);
    await page
      .getByRole("button", { name: "重置取景", exact: true })
      .first()
      .click();
    await expect(
      page.getByLabel("照片位置 1 缩放", { exact: true }),
    ).toHaveValue("1");
  } finally {
    if (id) await request.delete(`${api}/v1/stories/${id}`, { headers });
    for (const p of borrowed)
      await request.post(`${api}/v1/photos/${p.id}/share`, {
        headers: other,
        data: { is_shared: false },
      });
  }
});
