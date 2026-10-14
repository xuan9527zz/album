import { afterEach, expect, it } from "vitest";
import { localDatabase, demoUsers } from "../scripts/local-database";
import { createHandler } from "../apps/api/src/handler";
import { LocalStore } from "../scripts/local-store";
import { newZineConfig } from "../packages/zine/src/model";
import { musicEmbed, parseMusicUrl } from "../packages/zine/src/music";
import { storyBodySchema } from "../packages/zine/src/schema";
const opened: Awaited<ReturnType<typeof localDatabase>>[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((r) => r.sql.close()));
});
it("accepts only supported full song URLs and constructs fixed official addresses", () => {
  for (const url of [
    "https://music.163.com/song?id=186016&foo=bar",
    "https://music.163.com/#/song?id=186016",
    "https://music.163.com/m/song?id=186016",
    "https://i.y.qq.com/v8/playsong.html?songid=127570280&songtype=0",
  ]) {
    const result = parseMusicUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(
        musicEmbed({
          ...result,
          enabled: true,
          title: null,
          artist: null,
          schema_version: 1,
        }),
      ).not.toContain("foo");
  }
  for (const url of [
    "http://music.163.com/song?id=1",
    "https://music.163.com.evil.test/song?id=1",
    "https://a:secret@music.163.com/song?id=1",
    "https://music.163.com:444/song?id=1",
    "https://music.163.com/song?id=1&id=2",
    "https://music.163.com/?id=1#/song?id=2",
    "https://music.163.com/playlist?id=1",
    "https://music.163.com/song?id=0",
    "https://i.y.qq.com/v8/playsong.html?songid=12&songmid=ABC",
    "https://i.y.qq.com/v8/playsong.html?songid=12&songtype=1",
    "https://y.qq.com/n/ryqq/songDetail/ABC",
    "https://c6.y.qq.com/base/fcgi-bin/u?abc",
    "javascript:alert(1)",
    "歌曲 https://music.163.com/song?id=1",
  ])
    expect(parseMusicUrl(url).ok, url).toBe(false);
});
it("protects music writes, public link tokens and preview-only reading, and revokes access", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const [owner, other] = demoUsers;
  const photos = [crypto.randomUUID(), crypto.randomUUID()].map((id) => ({
    id,
    title: "样本",
    captured_local: null,
    location_label: "东京",
  }));
  for (const p of photos) {
    await setup.sql.query(
      "insert into public.photos(id,owner_id,title,location_label,lifecycle_status,original_status) values($1,$2,'样本','东京','active','saved')",
      [p.id, owner],
    );
    for (const role of ["preview", "original_image"])
      await setup.sql.query(
        "insert into public.photo_assets(id,photo_id,owner_id,role,object_key,original_filename,mime_type,size_bytes,checksum_value,md5,etag,provenance) values($1,$2,$3,$4,$5,'sample.jpg','image/jpeg',100,$6,'md5','etag','file_imported')",
        [
          crypto.randomUUID(),
          p.id,
          owner,
          role,
          `${p.id}/${role}`,
          "a".repeat(64),
        ],
      );
  }
  const handler = createHandler({
    db: setup.db,
    store: new LocalStore(),
    authenticate: async (token) =>
      token.startsWith("demo:") ? token.slice(5) : null,
    origins: ["http://localhost"],
    uploadTTL: 600,
    readTTL: 300,
  });
  const api = (
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
    user: string | null = owner,
  ) =>
    handler(
      new Request(`http://api${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer demo:${user}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const music = {
    provider: "netease",
    provider_track_id: "186016",
    enabled: true,
    title: "旅行",
    artist: null,
    schema_version: 1,
  };
  const body = {
    title: "影集",
    template: "zine-city",
    transition: "slide",
    is_shared: false,
    photo_ids: photos.map((p) => p.id),
    zine_config: {
      ...newZineConfig(photos, "zine-city"),
      background_color: "#123456",
    },
    music,
  };
  expect(
    storyBodySchema.safeParse({
      ...body,
      music: { ...music, embedUrl: "https://evil.test" },
    }).success,
  ).toBe(false);
  const created = await api("/v1/stories", body);
  expect(created.status).toBe(201);
  const story = await created.json();
  expect(story.zine_config.background_color).toBe("#123456");
  expect(story.music.source_url).toBe("https://music.163.com/song?id=186016");
  expect(
    (await api(`/v1/stories/${story.id}`, body, "PATCH", other)).status,
  ).toBe(404);
  expect(
    (await api(`/v1/stories/${story.id}/share`, {}, "POST", other)).status,
  ).toBe(404);
  const link = await (await api(`/v1/stories/${story.id}/share`, {})).json();
  expect(link.token).toMatch(/^[0-9a-f]{64}$/);
  const rows = await setup.sql.query<{ token_hash: string }>(
    "select token_hash from public.story_share_links",
  );
  expect(rows.rows[0].token_hash).not.toBe(link.token);
  const publicResponse = await api(
    `/v1/public/stories/${link.token}`,
    undefined,
    "GET",
    null,
  );
  expect(publicResponse.status).toBe(200);
  const publicStory = await publicResponse.json();
  expect(publicStory.photos).toHaveLength(2);
  expect(publicStory.urls).toHaveLength(2);
  expect(JSON.stringify(publicStory)).not.toMatch(
    /object_key|original_image|checksum_value|owner_id|token_hash/,
  );
  expect(publicStory.music.provider).toBe("netease");
  expect(
    (await api(`/v1/public/stories/${link.token}`, {}, "POST", null)).status,
  ).toBe(401);
  await setup.sql.exec("set role anon");
  await expect(
    setup.sql.query("select * from public.story_music"),
  ).rejects.toThrow(/permission/);
  await expect(
    setup.sql.query(
      "select public.album_story_public('" + rows.rows[0].token_hash + "')",
    ),
  ).rejects.toThrow(/permission/);
  await setup.sql.exec("reset role;set role authenticated");
  await expect(
    setup.sql.query("select * from public.story_share_links"),
  ).rejects.toThrow(/permission/);
  await setup.sql.exec("reset role");
  await api(`/v1/stories/${story.id}/share`, undefined, "DELETE");
  expect(
    (await api(`/v1/public/stories/${link.token}`, undefined, "GET", null))
      .status,
  ).toBe(404);
  const again = await (await api(`/v1/stories/${story.id}/share`, {})).json();
  const foreign = { ...photos[1], id: crypto.randomUUID() };
  await setup.sql.query(
    "insert into public.photos(id,owner_id,lifecycle_status,original_status,is_shared) values($1,$2,'active','saved',true)",
    [foreign.id, other],
  );
  expect(
    (
      await api(
        `/v1/stories/${story.id}`,
        {
          ...body,
          photo_ids: [photos[0].id, foreign.id],
          zine_config: newZineConfig([photos[0], foreign], "zine-city"),
        },
        "PATCH",
      )
    ).status,
  ).toBe(200);
  expect((await api(`/v1/stories/${story.id}/share`, {})).status).toBe(409);
  expect(
    (await api(`/v1/public/stories/${again.token}`, undefined, "GET", null))
      .status,
  ).toBe(404);
  await api(`/v1/stories/${story.id}`, undefined, "DELETE");
  expect(
    (await setup.sql.query("select * from public.story_music")).rows,
  ).toHaveLength(0);
});
