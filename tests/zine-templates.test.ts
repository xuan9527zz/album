import { afterEach, expect, it } from "vitest";
import { localDatabase, demoUsers } from "../scripts/local-database";
import { createHandler } from "../apps/api/src/handler";
import { LocalStore } from "../scripts/local-store";
import {
  getZineLayout,
  newZineConfig,
  photoDate,
  resolveZineText,
  syncZineConfig,
} from "../packages/zine/src/model";
import { storyBodySchema } from "../packages/zine/src/schema";
import type { ZinePhoto } from "../packages/zine/src/types";
import { zineCollections } from "../packages/zine/src/catalog";

const ids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
];
const photos: ZinePhoto[] = ids.map((id, i) => ({
  id,
  title: `照片 ${i}`,
  captured_local: "2026-10-14T23:45:00",
  location_label: "京都",
}));
const opened: Array<Awaited<ReturnType<typeof localDatabase>>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map(({ sql }) => sql.close()));
});

it("binds live metadata, keeps capture wall time, and never shifts a removed photo into another slot", () => {
  const config = newZineConfig(photos, "zine-city");
  expect(config.pages).toHaveLength(2);
  const page = config.pages[1];
  const binding = getZineLayout(page.layout)!.nodes.find(
    (n) => n.id === "title",
  )!.binding!;
  expect(
    resolveZineText(
      binding,
      page,
      new Map(photos.map((p) => [p.id, p])),
      "旅程",
      1,
    ),
  ).toBe("照片 1");
  const changed = photos.map((p) =>
    p.id === ids[1] ? { ...p, title: "改过的标题", location_label: "镰仓" } : p,
  );
  expect(
    resolveZineText(
      binding,
      page,
      new Map(changed.map((p) => [p.id, p])),
      "旅程",
      1,
    ),
  ).toBe("改过的标题");
  expect(photoDate(photos[0])).toBe("2026.10.14 23:45");
  const synced = syncZineConfig(config, [photos[0], photos[2]], "zine-city");
  expect(synced.pages[1].photo_ids).toEqual([null, ids[2]]);
  expect(
    resolveZineText(
      binding,
      synced.pages[1],
      new Map([[ids[2], photos[2]]]),
      "旅程",
      1,
    ),
  ).toBe("");
  expect(JSON.stringify(config)).not.toContain("京都");
  expect(JSON.stringify(config)).not.toContain("2026-10-14");
});

it("rejects geometry edits, foreign photo bindings and fields from a different fixed layout", () => {
  const config = newZineConfig(photos, "zine-diary");
  const body = {
    title: "旅程",
    template: "zine-diary",
    transition: "fade",
    is_shared: false,
    photo_ids: ids,
    zine_config: config,
  };
  expect(storyBodySchema.safeParse(body).success).toBe(true);
  expect(
    storyBodySchema.safeParse({ ...body, zine_config: { ...config, x: 300 } })
      .success,
  ).toBe(false);
  const wrong = structuredClone(config);
  wrong.pages[0].photo_ids = ["dddddddd-dddd-4ddd-8ddd-dddddddddddd"];
  expect(
    storyBodySchema.safeParse({ ...body, zine_config: wrong }).success,
  ).toBe(false);
  const fields = structuredClone(config);
  fields.pages[0].texts = { "unknown-script": "<script>alert(1)</script>" };
  expect(
    storyBodySchema.safeParse({ ...body, zine_config: fields }).success,
  ).toBe(false);
});

it("persists manual text through the API, reads edited metadata and redacts revoked photo IDs without moving slots", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const [owner, family] = demoUsers;
  for (const [i, id] of ids.entries())
    await setup.sql.query(
      "insert into public.photos(id,owner_id,title,captured_local,location_label,lifecycle_status,original_status,is_shared) values($1,$2,$3,'2026-10-14T23:45','京都','active','saved',true)",
      [id, owner, `标题 ${i}`],
    );
  const handler = createHandler({
    db: setup.db,
    store: new LocalStore(),
    origins: [],
    uploadTTL: 60,
    readTTL: 60,
    authenticate: async (token) => token,
  });
  const api = (
    path: string,
    data?: unknown,
    user = owner,
    method = data ? "POST" : "GET",
  ) =>
    handler(
      new Request(`https://example.test${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${user}`,
          "Content-Type": "application/json",
        },
        body: data ? JSON.stringify(data) : undefined,
      }),
    );
  const config = newZineConfig(photos, "zine-diary");
  config.pages[0].texts.intro = "这是我自己写的序言。\n第二行也要保留。";
  const response = await api("/v1/stories", {
    title: "余日",
    template: "zine-diary",
    transition: "fade",
    is_shared: true,
    photo_ids: ids,
    zine_config: config,
  });
  expect(response.status).toBe(201);
  const story = (await response.json()) as any;
  expect(story.template).toBe("zine-diary");
  expect(story.zine_config.pages[0].texts.intro).toBe(
    config.pages[0].texts.intro,
  );
  await setup.sql.query(
    "update public.photos set title='新标题',location_label='镰仓' where id=$1",
    [ids[1]],
  );
  const changed = (await api(`/v1/stories/${story.id}`).then((r) =>
    r.json(),
  )) as any;
  expect(changed.photos[1].title).toBe("新标题");
  expect(changed.photos[1].location_label).toBe("镰仓");
  await setup.sql.query(
    "update public.photos set is_shared=false where id=$1",
    [ids[1]],
  );
  const shared = (await api(`/v1/stories/${story.id}`, undefined, family).then(
    (r) => r.json(),
  )) as any;
  expect(shared.zine_config.pages[1].photo_ids).toEqual([null, ids[2]]);
  expect(JSON.stringify(shared)).not.toContain(ids[1]);
  expect(JSON.stringify(shared)).not.toContain("新标题");
  const list = (await api("/v1/stories", undefined, family).then((r) =>
    r.json(),
  )) as any;
  expect(list.stories[0]).not.toHaveProperty("zine_config");
  const own = (await api(`/v1/stories/${story.id}`).then((r) =>
    r.json(),
  )) as any;
  expect(own.zine_config.pages[1].photo_ids).toEqual([ids[1], ids[2]]);
  const forbidden = await api(
    `/v1/stories/${story.id}`,
    {
      title: "试图编辑",
      template: "zine-diary",
      transition: "fade",
      is_shared: false,
      photo_ids: ids,
      zine_config: config,
    },
    family,
    "PATCH",
  );
  expect([403, 404]).toContain(forbidden.status);
  // Exercise every layout through the real SQL validator, including the two-photo ending.
  for (const collection of zineCollections) {
    let cursor = 0;
    const pages = collection.spreads.map((layout) => ({
      id: crypto.randomUUID(),
      layout: layout.id,
      photo_ids: Array.from(
        { length: layout.slots },
        () => ids[cursor++ % ids.length],
      ),
      texts: Object.fromEntries(
        layout.fields.map((field) => [field.key, "这一页的文字"]),
      ),
    }));
    const body = {
      title: collection.name,
      template: `zine-${collection.id}`,
      transition: "fade",
      is_shared: false,
      photo_ids: ids,
      zine_config: { version: 1, pages },
    };
    expect(storyBodySchema.safeParse(body).success).toBe(true);
    const created = await api("/v1/stories", body);
    expect(created.status).toBe(201);
    const detail = (await created.json()) as any;
    expect(detail.zine_config.pages).toEqual(pages);
    const edited = await api(
      `/v1/stories/${detail.id}`,
      { ...body, title: "重新保存" },
      owner,
      "PATCH",
    );
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as any).zine_config.pages).toEqual(pages);
  }
});
