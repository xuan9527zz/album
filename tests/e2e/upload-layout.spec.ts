import { test, expect } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";

test("upload cards fit narrow phones and renamed originals resume from their source files", async ({
  page,
  request,
}, info) => {
  const headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
  await request.post("http://127.0.0.1:8788/__test/reset-request-limits");
  const before = await (
    await request.get("http://127.0.0.1:8788/v1/me", { headers })
  ).json();
  const name = "家人".repeat(20);
  expect(
    (
      await request.patch("http://127.0.0.1:8788/v1/me", {
        headers,
        data: { display_name: name },
      })
    ).ok(),
  ).toBe(true);
  const original = {
    name: "a8edbcff835e71f49f9b0cdf4bb175af-original-photo.png",
    mimeType: "image/png",
    buffer: await readFile(path.resolve("tests/fixtures/landscape-0.png")),
  };
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "我的示例相册" }).click();
    await page.goto("/#/upload");
    await page
      .locator(".upload-panel input[type=file]")
      .nth(1)
      .setInputFiles([
        original,
        { ...original, name: "2d9cf1767d2709ceba512e733900447e.png" },
      ]);
    const cards = page.locator(".upload-preview-card");
    await expect(cards).toHaveCount(2);
    await cards
      .first()
      .getByLabel("拍摄时间", { exact: true })
      .fill("2026-06-30T12:31");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() =>
          cards.evaluateAll(
            (nodes) =>
              nodes.every((card) => {
                const box = card.getBoundingClientRect();
                return [
                  ...card.querySelectorAll("strong,input,.upload-date-control"),
                ].every((node) => {
                  const r = node.getBoundingClientRect();
                  return r.left >= box.left && r.right <= box.right + 1;
                });
              }) &&
              document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
    }
    await expect(cards.first().locator("strong")).toHaveText(
      `${name}_待保存01.png`,
    );
    await page.screenshot({
      path: `.local/upload-layout-${info.project.name}.png`,
      fullPage: true,
    });
    // Simulate an interrupted PUT, then resume with the unchanged source file.
    await page
      .locator(".upload-panel input[type=file]")
      .nth(1)
      .setInputFiles(original);
    await page.route("http://127.0.0.1:8788/local-object/**", (route) =>
      route.request().method() === "PUT" ? route.abort() : route.continue(),
    );
    await page.getByRole("button", { name: "开始保存" }).click();
    await expect(page.locator(".queue-item.failed")).toBeVisible();
    const actualName = await page.locator(".queue-item strong").innerText();
    expect(actualName).toMatch(new RegExp(`^${name}_[a-f0-9-]{36}\\.png$`));
    await page.unroute("http://127.0.0.1:8788/local-object/**");
    await page.reload();
    await expect(page.locator(".resume-item")).toHaveCount(1);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "重新选择并继续" }).click();
    await (await chooser).setFiles(original);
    await expect(page.locator(".resume-item")).toHaveCount(0);
    const photoID = actualName.slice(name.length + 1, -4);
    const grant = await (
      await request.post(
        `http://127.0.0.1:8788/v1/photos/${photoID}/original-download`,
        { headers, data: {} },
      )
    ).json();
    expect(grant.filename).toBe(actualName);
    expect(await (await request.get(grant.url)).body()).toEqual(
      original.buffer,
    );
  } finally {
    await request.patch("http://127.0.0.1:8788/v1/me", {
      headers,
      data: { display_name: before.display_name },
    });
  }
});
