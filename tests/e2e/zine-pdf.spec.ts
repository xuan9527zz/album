import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { zineCollections } from "../../packages/zine/src/catalog";

test("exports all twelve fixed layouts with Chinese fonts and custom paper colours", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const api = "http://127.0.0.1:8788",
    headers = {
      Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
    };
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  // Resume tests deliberately leave an original without a preview. PDF samples
  // must select assets suitable for rendering, regardless of test order.
  const readyPhotos = photos.filter((photo: { assets: { role: string }[] }) =>
    photo.assets.some((asset) => asset.role === "preview"),
  );
  expect(readyPhotos.length).toBeGreaterThanOrEqual(3);
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  for (const collection of zineCollections) {
    const selected = readyPhotos.slice(0, collection.id === "city" ? 3 : 2);
    const config = {
      version: 1,
      background_color: collection.id === "coast" ? "#203A35" : "#F5EEE0",
      pages: collection.spreads.map((layout) => ({
        id: crypto.randomUUID(),
        layout: layout.id,
        photo_ids: Array.from(
          { length: layout.slots },
          (_, i) => selected[i].id,
        ),
        texts: Object.fromEntries(
          layout.fields.map((field) => [
            field.key,
            field.default || "走过街角，记下海风。\n这一页留给今天的回忆。",
          ]),
        ),
      })),
    };
    const response = await request.post(`${api}/v1/stories`, {
      headers,
      data: {
        title: "旅行版式",
        template: `zine-${collection.id}`,
        transition: "slide",
        is_shared: false,
        photo_ids: selected.map((p: { id: string }) => p.id),
        zine_config: config,
        music: null,
      },
    });
    expect(response.ok()).toBe(true);
    const story = await response.json();
    await page.goto(`/#/stories/${story.id}`);
    await page.getByRole("button", { name: "导出", exact: true }).click();
    await page.getByRole("button", { name: "制作 PDF", exact: true }).click();
    const link = page.getByRole("link", { name: "打开 PDF", exact: true });
    await expect(link).toBeVisible({ timeout: 45000 });
    const bytes = await page.evaluate(
      async (url) =>
        Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
      await link.getAttribute("href"),
    );
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    await writeFile(
      `.local/zine-pdf-${collection.id}-${testInfo.project.name}.pdf`,
      Buffer.from(bytes),
    );
    await request.delete(`${api}/v1/stories/${story.id}`, { headers });
  }
});
