import { afterEach, expect, it, vi } from "vitest";
import { localDatabase, demoUsers } from "../scripts/local-database";
import { LocalStore } from "../scripts/local-store";
import { LocalMusicStore } from "../scripts/local-music-store";
import { createHandler } from "../apps/api/src/handler";
import { cleanupMusic } from "../apps/api/src/music-handler";
import { GitHubMusicStore } from "../apps/api/src/music-store";
import { newZineConfig } from "../packages/zine/src/model";
import { parseMusicUrl, musicSource } from "../packages/zine/src/music";
const opened: Awaited<ReturnType<typeof localDatabase>>[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.sql.close()));
});

it("calls the runtime fetch without a MusicStore receiver", async () => {
  vi.stubGlobal("fetch", function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Illegal invocation");
    return Promise.resolve(new Response(new Uint8Array([73, 68])));
  });
  try {
    expect((await new GitHubMusicStore("fake-token").read(71)).status).toBe(
      200,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it("uploads MP3 bytes, binds owner-only music, streams publicly with ranges, and expires and retries deletion", async () => {
  const setup = await localDatabase();
  opened.push(setup);
  const [owner, other] = demoUsers;
  const store = new LocalMusicStore();
  const handler = createHandler({
    db: setup.db,
    store: new LocalStore(),
    musicStore: store,
    authenticate: async (token) => token,
    origins: ["https://album.test"],
    uploadTTL: 60,
    readTTL: 60,
  });
  const api = (
    path: string,
    data?: unknown,
    user: string | null = owner,
    method = data ? "POST" : "GET",
    extra: Record<string, string> = {},
  ) =>
    handler(
      new Request(`https://api.test${path}`, {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${user}` } : {}),
          ...(data instanceof FormData
            ? {}
            : data
              ? { "Content-Type": "application/json" }
              : {}),
          ...extra,
        },
        body:
          data instanceof FormData
            ? data
            : data
              ? JSON.stringify(data)
              : undefined,
      }),
    );
  const body = (name = "配乐.mp3") => {
    const b = new FormData();
    b.set(
      "file",
      new File([new Uint8Array([73, 68, 51, ...Array(253).fill(0)])], name, {
        type: "audio/mpeg",
      }),
    );
    return b;
  };
  expect((await api("/v1/music/uploads", body(), null)).status).toBe(401);
  expect((await api("/v1/music/uploads", body("fake.png"))).status).toBe(422);
  expect(
    (
      await api("/v1/music/uploads", body(), owner, "POST", {
        "Content-Length": String(20 * 1024 ** 2 + 8193),
      })
    ).status,
  ).toBe(413);
  const response = await api("/v1/music/uploads", body());
  expect(response.status).toBe(201);
  const audio = await response.json();
  expect(audio.title).toBe("配乐");
  expect(new Date(audio.expires_at).getTime() - Date.now()).toBeGreaterThan(
    71 * 3600000,
  );
  expect(parseMusicUrl(musicSource("file", audio.id))).toMatchObject({
    ok: true,
    provider: "file",
    provider_track_id: audio.id,
  });
  expect(
    (await (await api("/v1/music", undefined, other)).json()).files,
  ).toHaveLength(0);
  const stream = `/v1/music/${audio.id}/stream`;
  const ranged = await api(stream, undefined, null, "GET", {
    Range: "bytes=0-1",
  });
  expect(ranged.status).toBe(206);
  expect(ranged.headers.get("Content-Range")).toBe("bytes 0-1/256");
  expect([...new Uint8Array(await ranged.arrayBuffer())]).toEqual([73, 68]);
  const head = await api(stream, undefined, null, "HEAD");
  expect(head.status).toBe(200);
  expect(head.headers.get("Content-Length")).toBe("256");
  expect(await head.text()).toBe("");
  expect(
    (await api(stream, undefined, null, "GET", { Range: "bytes=0-1,2-3" }))
      .status,
  ).toBe(400);
  const photos = [0, 1].map((i) => ({
    id: crypto.randomUUID(),
    title: `照片${i}`,
    captured_local: null,
    location_label: null,
  }));
  for (const p of photos)
    await setup.sql.query(
      "insert into public.photos(id,owner_id,lifecycle_status,original_status) values($1,$2,'active','saved')",
      [p.id, owner],
    );
  const config = newZineConfig(photos, "zine-diary");
  config.slide_seconds = 4;
  config.background_color = "#123456";
  config.pages[0].photo_crops = [{ zoom: 2, x: 0.1, y: 0 }];
  const draft = {
    title: "临时配乐影集",
    template: "zine-diary",
    transition: "slide",
    is_shared: false,
    photo_ids: photos.map((p) => p.id),
    zine_config: config,
    music: {
      provider: "file",
      provider_track_id: audio.id,
      title: audio.title,
      artist: null,
      enabled: true,
      schema_version: 1,
    },
  };
  const created = await api("/v1/stories", draft);
  expect(created.status).toBe(201);
  const story = await created.json();
  expect(story.zine_config).toEqual(config);
  expect(story.music.expires_at).toBe(audio.expires_at);
  expect((await api("/v1/stories", draft, other)).status).toBe(410);
  const { token } = await (
    await api(`/v1/stories/${story.id}/share`, {})
  ).json();
  expect(
    (await (await api(`/v1/public/stories/${token}`, undefined, null)).json())
      .music.expired,
  ).toBe(false);
  await setup.sql.query(
    "update public.album_audio_files set expires_at=now()-interval '1 second' where id=$1",
    [audio.id],
  );
  expect((await api(stream, undefined, null)).status).toBe(410);
  expect(
    (await (await api(`/v1/public/stories/${token}`, undefined, null)).json())
      .music.expired,
  ).toBe(true);
  expect(
    (
      await api(
        `/v1/stories/${story.id}`,
        { ...draft, music: { ...draft.music, enabled: false } },
        owner,
        "PATCH",
      )
    ).status,
  ).toBe(200);
  const remove = store.remove.bind(store);
  let fail = true;
  store.remove = async (id) => {
    if (fail) throw Error("network");
    await remove(id);
  };
  expect(await cleanupMusic(setup.db, store)).toEqual({ due: 1, removed: 0 });
  expect(store.files.size).toBe(1);
  await setup.sql.query(
    "update public.album_audio_files set cleanup_after=now()-interval '1 second' where id=$1",
    [audio.id],
  );
  fail = false;
  expect(await cleanupMusic(setup.db, store)).toEqual({ due: 1, removed: 1 });
  expect(store.files.size).toBe(0);
  expect((await api(stream, undefined, null)).status).toBe(410);
  await setup.sql.exec("set role anon");
  await expect(
    setup.sql.query("select * from public.album_audio_files"),
  ).rejects.toThrow(/permission/);
  await setup.sql.exec("reset role");
});

it("uses GitHub Release binary APIs, strips credentials from CDN reads, and accepts an already deleted asset", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/tags/")) return new Response(null, { status: 404 });
    if (url.endsWith("/releases") && init?.method === "POST")
      return Response.json({ id: 42 });
    if (url.startsWith("https://uploads.github.com/"))
      return Response.json(
        {
          id: 71,
          name: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3",
          size: 16,
          state: "uploaded",
        },
        { status: 201 },
      );
    if (init?.method === "DELETE") return new Response(null, { status: 404 });
    if (url.startsWith("https://api.github.com/"))
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            "https://release-assets.githubusercontent.com/sample?signature=test",
        },
      });
    return new Response(new Uint8Array([73, 68]), {
      status: 206,
      headers: { "Content-Range": "bytes 0-1/16" },
    });
  };
  const store = new GitHubMusicStore("fake-token", fake);
  const file = new File([new Uint8Array(16)], "sample.mp3", {
    type: "audio/mpeg",
  });
  expect(await store.upload("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", file)).toBe(
    71,
  );
  const upload = requests.find((r) =>
    r.url.startsWith("https://uploads.github.com/"),
  )!;
  expect(upload.init?.body).toBe(file);
  expect((await store.read(71, "bytes=0-1")).status).toBe(206);
  const cdn = requests.find((r) =>
    r.url.startsWith("https://release-assets."),
  )!;
  expect(new Headers(cdn.init?.headers).has("Authorization")).toBe(false);
  expect(new Headers(cdn.init?.headers).get("Range")).toBe("bytes=0-1");
  expect(cdn.init?.redirect).toBe("manual");
  await expect(store.remove(71)).resolves.toBeUndefined();
});

it("retries release creation races and deletes only expired untracked album MP3 assets", async () => {
  const deleted: string[] = [];
  let lookup = 0;
  const old = new Date(Date.now() - 73 * 3600000).toISOString();
  const fresh = new Date(Date.now() - 3600000).toISOString();
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/tags/"))
      return ++lookup === 1
        ? new Response(null, { status: 404 })
        : Response.json({ id: 42 });
    if (init?.method === "POST") return new Response(null, { status: 422 });
    if (init?.method === "DELETE") {
      deleted.push(url);
      return new Response(null, { status: 204 });
    }
    if (url.includes("page=2"))
      return Response.json([
        {
          id: 101,
          name: "dddddddd-dddd-4ddd-8ddd-dddddddddddd.mp3",
          created_at: old,
        },
      ]);
    return Response.json([
      {
        id: 1,
        name: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3",
        created_at: old,
      },
      {
        id: 2,
        name: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.mp3",
        created_at: old,
      },
      {
        id: 3,
        name: "cccccccc-cccc-4ccc-8ccc-cccccccccccc.mp3",
        created_at: fresh,
      },
      { id: 4, name: "other-release-file.mp3", created_at: old },
      ...Array.from({ length: 96 }, (_, i) => ({
        id: i + 5,
        name: `unrelated-${i}.mp3`,
        created_at: old,
      })),
    ]);
  };
  const store = new GitHubMusicStore("fake-token", fake);
  await store.reconcile([2]);
  expect(lookup).toBe(2);
  expect(deleted).toEqual([
    "https://api.github.com/repos/xuan9527zz/album/releases/assets/1",
    "https://api.github.com/repos/xuan9527zz/album/releases/assets/101",
  ]);
});
