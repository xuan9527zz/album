import { afterEach, expect, it } from "vitest";
import { cropGeometry } from "../packages/zine/src/crop";
import { newZineConfig } from "../packages/zine/src/model";
import { storyBodySchema } from "../packages/zine/src/schema";
import { localDatabase, demoUsers } from "../scripts/local-database";
import { createHandler } from "../apps/api/src/handler";
import { LocalStore } from "../scripts/local-store";
const opened: Awaited<ReturnType<typeof localDatabase>>[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((r) => r.sql.close()));
});

it("keeps cover framing inside the photo and uses proportional geometry for PDF and mobile", () => {
  for (const [iw, ih] of [
    [4000, 3000],
    [1000, 4000],
  ]) {
    const crop = { zoom: 2.5, x: 0.2, y: -0.15 };
    const full = cropGeometry(iw, ih, 600, 800, crop);
    const phone = cropGeometry(iw, ih, 150, 200, crop);
    for (const key of ["left", "top", "width", "height"] as const)
      expect(phone[key]).toBeCloseTo(full[key] / 4);
    const edge = cropGeometry(iw, ih, 600, 800, { zoom: 1, x: 2, y: -2 });
    expect(edge.left).toBeLessThanOrEqual(0);
    expect(edge.left + edge.width).toBeGreaterThanOrEqual(600);
    expect(edge.top).toBeLessThanOrEqual(0);
    expect(edge.top + edge.height).toBeGreaterThanOrEqual(800);
  }
  expect(cropGeometry(1000, 4000, 600, 800, null, "50% 0%").top).toBe(0);
});

it("creates zines from another member's shared photos, persists framing, and removes revoked references", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const [author, photographer, family] = demoUsers;
  const photos = [0, 1].map((i) => ({
    id: crypto.randomUUID(),
    title: `共享-${i}`,
    captured_local: null,
    location_label: null,
  }));
  for (const p of photos)
    await setup.sql.query(
      "insert into public.photos(id,owner_id,title,lifecycle_status,original_status,is_shared) values($1,$2,$3,'active','saved',true)",
      [p.id, photographer, p.title],
    );
  const handler = createHandler({
    db: setup.db,
    store: new LocalStore(),
    authenticate: async (token) => token,
    origins: [],
    uploadTTL: 60,
    readTTL: 60,
  });
  const api = (
    path: string,
    data?: unknown,
    user = author,
    method = data ? "POST" : "GET",
  ) =>
    handler(
      new Request(`https://api.test${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    );
  const config = newZineConfig(photos, "zine-diary");
  config.slide_seconds = 4;
  config.background_color = "#123456";
  config.pages[0].photo_crops = [{ zoom: 2.2, x: 0.1, y: -0.2 }];
  const body = {
    title: "家人照片的影集",
    template: "zine-diary",
    transition: "slide",
    is_shared: true,
    photo_ids: photos.map((p) => p.id),
    zine_config: config,
    music: {
      provider: "file",
      provider_track_id: "whenever",
      title: "Whenever",
      artist: null,
      enabled: true,
      schema_version: 1,
    },
  };
  const created = await api("/v1/stories", body);
  expect(created.status).toBe(201);
  const story = await created.json();
  expect(story.is_owner).toBe(true);
  expect(story.photos).toHaveLength(2);
  expect(story.zine_config).toEqual(config);
  expect((await api(`/v1/stories/${story.id}`, undefined, family)).status).toBe(
    200,
  );
  for (const invalid of [
    { zoom: 6, x: 0, y: 0 },
    { zoom: 2, x: 3, y: 0 },
    { zoom: 2, x: 0, y: "0" },
    { zoom: 2, x: 0, y: 0, url: "bad" },
  ]) {
    const wrong = structuredClone(body);
    wrong.zine_config.pages[0].photo_crops = [invalid as any];
    expect(storyBodySchema.safeParse(wrong).success).toBe(false);
    expect(
      (await api(`/v1/stories/${story.id}`, wrong, author, "PATCH")).status,
    ).toBe(400);
    await expect(
      setup.db.call("album_v11_action", {
        p_owner: author,
        p_action: "update",
        p_data: { ...wrong, story_id: story.id },
      }),
    ).rejects.toThrow(/BAD_REQUEST/);
  }
  expect(
    (
      await api(
        `/v1/stories/${story.id}`,
        { ...body, title: "新标题" },
        family,
        "PATCH",
      )
    ).status,
  ).toBe(404);
  await setup.sql.query(
    "update public.photos set is_shared=false where id=$1",
    [photos[0].id],
  );
  const redacted = await (await api(`/v1/stories/${story.id}`)).json();
  expect(redacted.photos.map((p: any) => p.id)).toEqual([photos[1].id]);
  expect(redacted.zine_config.pages[0].photo_ids[0]).toBeNull();
  expect((await api("/v1/stories", body)).status).toBe(404);
});
