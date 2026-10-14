import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { newZineConfig } from "../../packages/zine/src/model";
const api = "http://127.0.0.1:8788",
  headers = {
    Authorization: "Bearer demo:11111111-1111-4111-8111-111111111111",
  };
async function openTrial(page: Page, request: APIRequestContext, mode: string) {
  await request.post(`${api}/__test/reset-request-limits`);
  const { photos } = await (
    await request.get(`${api}/v1/photos?featured=false`, { headers })
  ).json();
  const selected = photos
    .filter((p: any) => p.assets.some((a: any) => a.role === "preview"))
    .slice(0, 3);
  const story = await (
    await request.post(`${api}/v1/stories`, {
      headers,
      data: {
        title: "播放恢复试验",
        template: "zine-diary",
        transition: "slide",
        is_shared: false,
        photo_ids: selected.map((p: any) => p.id),
        zine_config: {
          ...newZineConfig(selected, "zine-diary"),
          slide_seconds: 60,
        },
        music: null,
      },
    })
  ).json();
  await page.goto("/");
  await page.getByRole("button", { name: "我的示例相册" }).click();
  await page.goto(`/?musicTrial=${mode}#/stories/${story.id}`);
  return story.id as string;
}
test("native music retries the same URL after server recovery and starts the slideshow", async ({
  page,
  request,
}) => {
  const id = await openTrial(page, request, "failure");
  await expect(page.getByRole("alert")).toContainText("配乐暂时无法播放");
  const url = await page.locator("audio").getAttribute("src");
  await request.post(`${api}/__music-trial/recover?failure=${id}`);
  await page.getByRole("button", { name: "重试配乐", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  await expect(page.locator("audio")).toHaveAttribute("src", url!);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "暂停影集", exact: true }).click();
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});
test("stalled native music times out and reloads while leaving photo navigation usable", async ({
  page,
  request,
}) => {
  await page.clock.install();
  const id = await openTrial(page, request, "stall");
  await page.getByRole("button", { name: "播放影集", exact: true }).click();
  await page.clock.fastForward(46000);
  await expect(page.getByRole("alert")).toContainText("配乐加载超时");
  await request.post(`${api}/__music-trial/recover?failure=${id}`);
  await page.getByRole("button", { name: "重试配乐", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0.25);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "暂停影集", exact: true }).click();
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});
test("invalid music can be muted and the album can still be played", async ({
  page,
  request,
}) => {
  const id = await openTrial(page, request, "invalid");
  await expect(page.getByRole("alert")).toContainText("配乐暂时无法播放");
  await page.getByRole("button", { name: "静音", exact: true }).click();
  await page.getByRole("button", { name: "播放影集", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暂停影集", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".story-player-count")).toContainText("02 /");
  await page.getByRole("button", { name: "暂停影集", exact: true }).click();
  await request.delete(`${api}/v1/stories/${id}`, { headers });
});
