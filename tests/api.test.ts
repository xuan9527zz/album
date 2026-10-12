import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { localDatabase, demoUsers } from "../scripts/local-database";
import { LocalStore } from "../scripts/local-store";
import { createHandler, cleanUp } from "../apps/api/src/handler";
import { R2Store, sniff } from "../apps/api/src/storage";
import { localEXIFDate } from "../apps/web/src/files";
let database: Awaited<ReturnType<typeof localDatabase>>,
  store: LocalStore,
  handler: ReturnType<typeof createHandler>,
  body: Uint8Array;
const A = demoUsers[0],
  B = demoUsers[1];
const token = (user = A) => `test:${user}`;
function spec(role = "original_image", content = body) {
  return {
    role,
    filename: "test.png",
    mime: "image/png",
    size: content.length,
    md5: createHash("md5").update(content).digest("base64"),
    sha256: createHash("sha256").update(content).digest("hex"),
    provenance: "file_imported",
  };
}
async function api(
  path: string,
  data?: unknown,
  method = data ? "POST" : "GET",
  user: string | null = A,
  key?: string,
) {
  return handler(
    new Request(`https://api.example${path}`, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    }),
  );
}
async function init(
  user = A,
  key = crypto.randomUUID(),
  assets = [spec()],
  metadata: any = {
    date_source: "unknown",
    location_source: "unknown",
    is_featured: false,
  },
) {
  const response = await api(
    "/v1/uploads/init",
    { assets, metadata },
    "POST",
    user,
    key,
  );
  expect(response.status).toBe(201);
  return (await response.json()) as any;
}
async function transfer(r: any, role = "original_image", content = body) {
  const item = r.session.items.find((i: any) => i.role === role);
  const grant = r.grants.find((g: any) => g.asset_id === item.id);
  const put = await store.fetch(
    new Request(grant.url, {
      method: "PUT",
      headers: grant.headers,
      body: content as BodyInit,
    }),
  );
  expect(put.status).toBe(200);
  return api(`/v1/uploads/${r.session.id}/assets/${item.id}/complete`, {});
}
beforeAll(async () => {
  database = await localDatabase();
  body = new Uint8Array(
    await readFile(new URL("./fixtures/landscape-0.png", import.meta.url)),
  );
});
beforeEach(async () => {
  await database.sql.exec(
    "truncate public.photos,public.upload_sessions,public.upload_items,public.photo_assets,public.request_limits cascade;update public.storage_budget set committed_bytes=0,reserved_bytes=0,budget_bytes=8000000000,warning_bytes=6000000000;update public.profiles set is_active=true;",
  );
  store = new LocalStore();
  handler = createHandler({
    db: database.db,
    store,
    origins: ["https://album.example"],
    uploadTTL: 600,
    readTTL: 300,
    async authenticate(t) {
      const user = t.startsWith("test:") ? t.slice(5) : "";
      return /^[a-f0-9-]{36}$/.test(user) ? user : null;
    },
  });
});
afterAll(async () => {
  await database.sql.close();
});
describe("real SQL migration + API, simulated object transport", () => {
  it("rejects unauthenticated calls, disallowed origins, and nonmembers", async () => {
    expect((await api("/v1/photos", undefined, "GET", null)).status).toBe(401);
    expect(
      (
        await api(
          "/v1/me",
          undefined,
          "GET",
          "55555555-5555-4555-8555-555555555555",
        )
      ).status,
    ).toBe(403);
    const r = await handler(
      new Request("https://api.example/v1/me", {
        headers: {
          Origin: "https://evil.example",
          Authorization: `Bearer ${token()}`,
        },
      }),
    );
    expect(r.status).toBe(403);
  });
  it("active membership is rechecked with a still valid token", async () => {
    await database.sql.query(
      "update public.profiles set is_active=false where user_id=$1",
      [A],
    );
    expect((await api("/v1/me")).status).toBe(403);
  });
  it("four-member constraint prevents a fifth active account", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    await database.sql.query("insert into auth.users values($1)", [id]);
    await expect(
      database.sql.query(
        "insert into public.profiles values($1,$2,true,now())",
        [id, "五"],
      ),
    ).rejects.toThrow("MEMBER_LIMIT");
  });
  it("owns every photo/session/asset lookup and returns 404 for cross-account access", async () => {
    const r = await init();
    await transfer(r);
    const pid = r.session.photo_id;
    for (const [path, data, method] of [
      [`/v1/photos/${pid}`, undefined, "GET"],
      [`/v1/photos/${pid}`, { is_featured: true }, "PATCH"],
      [`/v1/photos/${pid}`, undefined, "DELETE"],
      [`/v1/photos/${pid}/original-download`, {}, "POST"],
      [`/v1/uploads/${r.session.id}`, undefined, "GET"],
      [`/v1/uploads/${r.session.id}/refresh`, {}, "POST"],
    ] as const)
      expect((await api(path, data, method, B)).status).toBe(404);
    expect((await api("/v1/photos", undefined, "GET", B)).status).toBe(200);
    expect(
      ((await (await api("/v1/photos", undefined, "GET", B)).json()) as any)
        .photos,
    ).toHaveLength(0);
  });
  it("rejects injected owners, keys, roles, and unapproved field writes", async () => {
    const x = await api(
      "/v1/uploads/init",
      { assets: [{ ...spec(), object_key: "private/other" }], metadata: {} },
      "POST",
      A,
      crypto.randomUUID(),
    );
    expect(x.status).toBe(400);
    const r = await init();
    expect(
      (await api(`/v1/photos/${r.session.photo_id}`, { owner_id: B }, "PATCH"))
        .status,
    ).toBe(400);
    expect(
      (
        await api(
          "/v1/uploads/init",
          { assets: [spec("live_video")], metadata: {} },
          "POST",
          A,
          crypto.randomUUID(),
        )
      ).status,
    ).toBe(400);
  });
  it("same idempotency key returns the same upload; changed body returns 409", async () => {
    const key = crypto.randomUUID();
    const r = await init(A, key);
    const s = await init(A, key);
    expect(r.session.id).toBe(s.session.id);
    expect(
      (
        await api(
          "/v1/uploads/init",
          { assets: [spec()], metadata: { is_featured: true } },
          "POST",
          A,
          key,
        )
      ).status,
    ).toBe(409);
    expect(
      ((await api("/v1/usage").then((r) => r.json())) as any).reserved_bytes,
    ).toBe(body.length);
  });
  it("transport rejects a changed body even with the approved checksum header", async () => {
    const r = await init();
    const g = r.grants[0];
    const changed = body.slice();
    changed[200] ^= 1;
    expect(
      (
        await store.fetch(
          new Request(g.url, {
            method: "PUT",
            headers: g.headers,
            body: changed as BodyInit,
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("replaying a committed PUT cannot change the original; download SHA256 matches", async () => {
    const r = await init();
    expect((await transfer(r)).status).toBe(200);
    const g = r.grants[0];
    expect(
      (
        await store.fetch(
          new Request(g.url, {
            method: "PUT",
            headers: g.headers,
            body: body as BodyInit,
          }),
        )
      ).status,
    ).toBe(412);
    const link = (await (
      await api(`/v1/photos/${r.session.photo_id}/original-download`, {})
    ).json()) as any;
    const bytes = await (
      await store.fetch(new Request(link.url))
    ).arrayBuffer();
    expect(
      createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
    ).toBe(spec().sha256);
  });
  it("complete is idempotent and quota only commits once", async () => {
    const r = await init();
    await transfer(r);
    expect(
      (
        await api(
          `/v1/uploads/${r.session.id}/assets/${r.session.items[0].id}/complete`,
          {},
        )
      ).status,
    ).toBe(200);
    const usage = (await (await api("/v1/usage")).json()) as any;
    expect(usage.committed_bytes).toBe(body.length);
    expect(usage.reserved_bytes).toBe(0);
  });
  it("read URLs authorize real thumbnail assets and reject another owner", async () => {
    const r = await init(A, crypto.randomUUID(), [
      spec(),
      spec("preview"),
      spec("thumbnail"),
    ]);
    await transfer(r);
    await transfer(r, "preview");
    await transfer(r, "thumbnail");
    const thumbnail = r.session.items.find(
      (i: any) => i.role === "thumbnail",
    ).id;
    const read = await api("/v1/assets/read-urls", { ids: [thumbnail] });
    expect(read.status).toBe(200);
    const urls = (await read.json()) as any;
    expect((await store.fetch(new Request(urls.urls[0].url))).status).toBe(200);
    expect(
      (await api("/v1/assets/read-urls", { ids: [thumbnail] }, "POST", B))
        .status,
    ).toBe(404);
  });
  it("atomic reservations prevent aggregate oversubscription across four users", async () => {
    await database.sql.query(
      "update public.storage_budget set budget_bytes=$1,warning_bytes=$1",
      [body.length * 2],
    );
    const results = await Promise.all(
      demoUsers.map((user) =>
        api(
          "/v1/uploads/init",
          { assets: [spec()], metadata: {} },
          "POST",
          user,
          crypto.randomUUID(),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 409, 409]);
    const usage = (await (await api("/v1/usage")).json()) as any;
    expect(usage.reserved_bytes).toBe(body.length * 2);
  });
  it("rejects declared-size mismatch and fake content signatures", async () => {
    const fake = new Uint8Array(body.length).fill(65);
    const r = await init(A, crypto.randomUUID(), [
      spec("original_image", fake),
    ]);
    expect((await transfer(r, "original_image", fake)).status).toBe(422);
    expect(
      ((await api("/v1/usage").then((r) => r.json())) as any).committed_bytes,
    ).toBe(0);
  });
  it("preserves original after cancelled preview failure, releases only after signature expiry", async () => {
    const r = await init(A, crypto.randomUUID(), [spec(), spec("preview")]);
    await transfer(r);
    await api(`/v1/uploads/${r.session.id}/cancel`, {});
    const initial = await cleanUp(database.db, store, false);
    expect(initial.sessions).toBe(0);
    await database.sql.exec(
      "update public.upload_items set signed_until=now()-interval '2 minutes'",
    );
    await cleanUp(database.db, store, false);
    const p = (await (
      await api(`/v1/photos/${r.session.photo_id}`)
    ).json()) as any;
    expect(p.original_status).toBe("saved");
    expect(p.preview_status).toBe("failed");
    expect(store.objects.size).toBe(1);
    const usage = (await (await api("/v1/usage")).json()) as any;
    expect(usage.committed_bytes).toBe(body.length);
    expect(usage.reserved_bytes).toBe(0);
  });
  it("replaces a preview, then removes the obsolete object and quota only after its signature expires", async () => {
    const first = await init(A, crypto.randomUUID(), [spec(), spec("preview")]);
    await transfer(first);
    await transfer(first, "preview");
    const firstPreview = first.session.items.find(
      (i: any) => i.role === "preview",
    );
    const replacementResponse = await api(
      `/v1/photos/${first.session.photo_id}/assets/init`,
      { assets: [spec("preview")], metadata: {} },
      "POST",
      A,
      crypto.randomUUID(),
    );
    expect(replacementResponse.status).toBe(201);
    const replacement = (await replacementResponse.json()) as any;
    await transfer(replacement, "preview");
    const photo = (await (
      await api(`/v1/photos/${first.session.photo_id}`)
    ).json()) as any;
    const current = photo.assets.find((a: any) => a.role === "preview");
    expect(current.id).not.toBe(firstPreview.id);
    expect(photo.assets.filter((a: any) => a.role === "preview")).toHaveLength(
      1,
    );
    expect(
      ((await (await api("/v1/usage")).json()) as any).committed_bytes,
    ).toBe(body.length * 3);
    expect(store.objects.size).toBe(3);
    expect((await cleanUp(database.db, store, false)).sessions).toBe(0);
    await database.sql.exec(
      "update public.upload_items set signed_until=now()-interval '2 minutes'",
    );
    await cleanUp(database.db, store, false);
    expect(store.objects.size).toBe(2);
    expect(
      ((await (await api("/v1/usage")).json()) as any).committed_bytes,
    ).toBe(body.length * 2);
    const currentKey = (
      await database.sql.query<any>(
        "select object_key from public.photo_assets where id=$1",
        [current.id],
      )
    ).rows[0].object_key;
    expect((await store.head(currentKey))?.size).toBe(body.length);
  });
  it("supplements only an existing owner's photo with a manually paired video", async () => {
    const first = await init();
    await transfer(first);
    const video = new TextEncoder().encode(
      "\0\0\0\x18ftypisom\0\0\0\0isommp41",
    );
    const videoSpec = {
      ...spec("live_video", video),
      filename: "synthetic.mp4",
      mime: "video/mp4",
    };
    const path = `/v1/photos/${first.session.photo_id}/assets/init`;
    expect(
      (
        await api(
          path,
          { assets: [videoSpec], metadata: {} },
          "POST",
          B,
          crypto.randomUUID(),
        )
      ).status,
    ).toBe(404);
    const response = await api(
      path,
      { assets: [videoSpec], metadata: {} },
      "POST",
      A,
      crypto.randomUUID(),
    );
    expect(response.status).toBe(201);
    const addition = (await response.json()) as any;
    expect((await transfer(addition, "live_video", video)).status).toBe(200);
    const photo = (await (
      await api(`/v1/photos/${first.session.photo_id}`)
    ).json()) as any;
    expect(photo.live_status).toBe("paired_unverified");
    const videoAsset = photo.assets.find((a: any) => a.role === "live_video");
    expect(
      (
        await database.sql.query<any>(
          "select pairing_method from public.photo_assets where id=$1",
          [videoAsset.id],
        )
      ).rows[0].pairing_method,
    ).toBe("manual");
    expect(
      (
        await api(
          path,
          { assets: [videoSpec], metadata: {} },
          "POST",
          A,
          crypto.randomUUID(),
        )
      ).status,
    ).toBe(409);
    const link = (await (
      await api(`/v1/photos/${first.session.photo_id}/original-download`, {
        role: "live_video",
      })
    ).json()) as any;
    expect(
      new Uint8Array(
        await (await store.fetch(new Request(link.url))).arrayBuffer(),
      ),
    ).toEqual(video);
  });
  it("deletion stops new links, waits for replay window, and handles retry without negative budget", async () => {
    const r = await init();
    await transfer(r);
    expect(
      (await api(`/v1/photos/${r.session.photo_id}`, undefined, "DELETE"))
        .status,
    ).toBe(202);
    expect(
      (await api(`/v1/photos/${r.session.photo_id}/original-download`, {}))
        .status,
    ).toBe(404);
    expect((await cleanUp(database.db, store, false)).photos).toBe(0);
    await database.sql.exec(
      "update public.upload_items set signed_until=now()-interval '2 minutes'",
    );
    await cleanUp(database.db, store, false);
    await cleanUp(database.db, store, false);
    expect(store.objects.size).toBe(0);
    const usage = (await (await api("/v1/usage")).json()) as any;
    expect(usage.committed_bytes).toBe(0);
    expect(usage.reserved_bytes).toBe(0);
  });
  it("deletion failure keeps records and quota for an eventual retry", async () => {
    const r = await init();
    await transfer(r);
    await api(`/v1/photos/${r.session.photo_id}`, undefined, "DELETE");
    await database.sql.exec(
      "update public.upload_items set signed_until=now()-interval '2 minutes'",
    );
    const original = store.remove.bind(store);
    store.remove = async () => {
      throw new Error("offline");
    };
    await expect(cleanUp(database.db, store, false)).rejects.toThrow("offline");
    expect(
      ((await api("/v1/usage").then((r) => r.json())) as any).committed_bytes,
    ).toBe(body.length);
    store.remove = original;
    await cleanUp(database.db, store, false);
    expect(
      ((await api("/v1/usage").then((r) => r.json())) as any).committed_bytes,
    ).toBe(0);
  });
  it("cancelled PUT can reappear before expiry and known-key cleanup converges", async () => {
    const r = await init();
    await api(`/v1/uploads/${r.session.id}/cancel`, {});
    const g = r.grants[0];
    expect(
      (
        await store.fetch(
          new Request(g.url, {
            method: "PUT",
            headers: g.headers,
            body: body as BodyInit,
          }),
        )
      ).status,
    ).toBe(200);
    await database.sql.exec(
      "update public.upload_items set signed_until=now()-interval '2 minutes'",
    );
    await cleanUp(database.db, store, false);
    expect(store.objects.size).toBe(0);
    expect(
      ((await api("/v1/usage").then((r) => r.json())) as any).reserved_bytes,
    ).toBe(0);
  });
  it("restoring database completion after a transient outage preserves stored original", async () => {
    const r = await init();
    const g = r.grants[0];
    await store.fetch(
      new Request(g.url, {
        method: "PUT",
        headers: g.headers,
        body: body as BodyInit,
      }),
    );
    const original = database.db.call.bind(database.db);
    database.db.call = async (name, args) => {
      if (args.p_action === "complete") throw new Error("transient");
      return original(name, args);
    };
    expect(
      (
        await api(
          `/v1/uploads/${r.session.id}/assets/${r.session.items[0].id}/complete`,
          {},
        )
      ).status,
    ).toBe(503);
    database.db.call = original;
    expect(
      (
        await api(
          `/v1/uploads/${r.session.id}/assets/${r.session.items[0].id}/complete`,
          {},
        )
      ).status,
    ).toBe(200);
  });
  it("local time without an offset remains local and editing never modifies original assets", async () => {
    expect(localEXIFDate("2026:10:12 00:30:00")).toBe("2026-10-12T00:30:00");
    const r = await init(A, crypto.randomUUID(), [spec()], {
      captured_local: "2026-10-12T00:30:00",
      date_source: "exif",
    });
    await transfer(r);
    const p = (await (
      await api(`/v1/photos/${r.session.photo_id}`)
    ).json()) as any;
    expect(p.captured_utc).toBeNull();
    expect(p.sort_date).toBe("2026-10-12");
    await api(
      `/v1/photos/${p.id}`,
      { captured_local: "2026-09-01T12:00", location_label: "海边" },
      "PATCH",
    );
    expect(store.objects.size).toBe(1);
    expect(
      (
        await database.sql.query<any>(
          "select source_metadata from public.photos where id=$1",
          [p.id],
        )
      ).rows[0].source_metadata.date_source,
    ).toBe("exif");
  });
  it("cursor traversal covers 2000 rows once, with stable sorting", async () => {
    await database.sql.query(
      "insert into public.photos(owner_id,sort_date,uploaded_at) select $1,'2026-10-01',now() from generate_series(1,2000)",
      [A],
    );
    let cursor = null;
    const ids = new Set<string>();
    do {
      const r = (await (
        await api(
          `/v1/photos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        )
      ).json()) as any;
      for (const p of r.photos) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
      cursor = r.next_cursor;
    } while (cursor);
    expect(ids.size).toBe(2000);
  });
  it("RLS exposes only own rows, hides inactive rows, and revokes direct writes/private tables/RPCs", async () => {
    await init();
    await init(B);
    try {
      await database.sql.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${A}',false);`,
      );
      expect(
        (await database.sql.query("select * from public.photos")).rows,
      ).toHaveLength(1);
      expect(
        (await database.sql.query("select * from public.profiles")).rows,
      ).toHaveLength(1);
      for (const q of [
        "select * from public.storage_budget",
        "select * from public.upload_sessions",
        "update public.profiles set is_active=true",
        `select public.album_action('${B}','me','{}')`,
      ])
        await expect(database.sql.query(q)).rejects.toThrow(
          /permission denied/,
        );
      await database.sql.exec("reset role");
      await database.sql.query(
        "update public.profiles set is_active=false where user_id=$1",
        [A],
      );
      await database.sql.exec("set role authenticated");
      expect(
        (await database.sql.query("select * from public.photos")).rows,
      ).toHaveLength(0);
    } finally {
      await database.sql.exec("reset role");
    }
  });
  it("anon cannot read business tables or invoke member/private functions", async () => {
    try {
      await database.sql.exec("set role anon");
      for (const q of [
        "select * from public.photos",
        "select public.is_album_member()",
        `select public.album_action('${A}','me','{}')`,
      ])
        await expect(database.sql.query(q)).rejects.toThrow(
          /permission denied/,
        );
    } finally {
      await database.sql.exec("reset role");
    }
  });
  it("signed R2 PUT binds method, size, checksum, type, and create-only condition", async () => {
    const r2 = new R2Store({
      R2_ACCOUNT_ID: "example",
      R2_BUCKET_NAME: "album",
      R2_ACCESS_KEY_ID: "test-access",
      R2_SECRET_ACCESS_KEY: "test-secret",
    });
    const g = await r2.grantPut(
      "private/example/item",
      spec() as any,
      "asset",
      600,
    );
    const u = new URL(g.url);
    const headers = u.searchParams.get("X-Amz-SignedHeaders")!;
    for (const h of [
      "content-length",
      "content-md5",
      "content-type",
      "if-none-match",
    ])
      expect(headers).toContain(h);
    expect(g.headers["If-None-Match"]).toBe("*");
    expect("Content-Length" in g.headers).toBe(false);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
  });
  it("signature sniffing distinguishes permitted formats and missing headers", () => {
    expect(sniff(body, "image/png", "a.png")).toBe(true);
    expect(sniff(body, "image/jpeg", "a.jpg")).toBe(false);
    expect(sniff(body, "image/png", "a.mov")).toBe(false);
    const heic = new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0mif1heic");
    expect(sniff(heic, "image/heic", "a.heic")).toBe(true);
    expect(sniff(heic, "video/quicktime", "a.mov")).toBe(false);
  });
});
