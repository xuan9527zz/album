import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ask, password } from "./secure-input";
import assert from "node:assert/strict";
async function main() {
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.API_BASE_URL)
    throw new Error("Missing cloud configuration");
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const login = await auth.auth.signInWithPassword({
    email: await ask("本人测试账号邮箱："),
    password: await password(),
  });
  if (login.error || !login.data.session) throw new Error("Login failed");
  const token = login.data.session.access_token;
  const photos: string[] = [];
  const request = async (
    path: string,
    data?: any,
    method = data ? "POST" : "GET",
    bearer = token,
    key?: string,
  ) =>
    fetch(`${env.API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  try {
    for (const file of ["landscape-0.png", "synthetic.heic"]) {
      const bytes = await readFile(
        new URL(`../tests/fixtures/${file}`, import.meta.url),
      );
      const mime = file.endsWith("heic") ? "image/heic" : "image/png";
      const sha = createHash("sha256").update(bytes).digest("hex");
      const payload = {
        assets: [
          {
            role: "original_image",
            filename: file,
            mime,
            size: bytes.length,
            md5: createHash("md5").update(bytes).digest("base64"),
            sha256: sha,
            provenance: "file_imported",
          },
        ],
        metadata: {},
      };
      const key = crypto.randomUUID();
      const init = await request(
        "/v1/uploads/init",
        payload,
        "POST",
        token,
        key,
      );
      assert.equal(init.status, 201);
      const r = (await init.json()) as any;
      photos.push(r.session.photo_id);
      const g = r.grants[0];
      assert.ok(
        (await fetch(g.url, { method: "PUT", headers: g.headers, body: bytes }))
          .ok,
      );
      const complete = `/v1/uploads/${r.session.id}/assets/${r.session.items[0].id}/complete`;
      assert.equal((await request(complete, {})).status, 200);
      assert.equal((await request(complete, {})).status, 200);
      assert.equal(
        (await fetch(g.url, { method: "PUT", headers: g.headers, body: bytes }))
          .status,
        412,
      );
      const dl = await request(
        `/v1/photos/${r.session.photo_id}/original-download`,
        {},
      );
      assert.ok(dl.ok);
      const link = (await dl.json()) as any;
      const content = await fetch(link.url);
      assert.ok(content.ok);
      assert.equal(
        createHash("sha256")
          .update(new Uint8Array(await content.arrayBuffer()))
          .digest("hex"),
        sha,
      );
      const changed = { ...payload, metadata: { is_featured: true } };
      assert.equal(
        (await request("/v1/uploads/init", changed, "POST", token, key)).status,
        409,
      );
    }
    const bytes = await readFile(
      new URL("../tests/fixtures/landscape-0.png", import.meta.url),
    );
    const init = await request(
      "/v1/uploads/init",
      {
        assets: [
          {
            role: "original_image",
            filename: "tamper-check.png",
            mime: "image/png",
            size: bytes.length,
            md5: createHash("md5").update(bytes).digest("base64"),
            sha256: createHash("sha256").update(bytes).digest("hex"),
            provenance: "file_imported",
          },
        ],
        metadata: {},
      },
      "POST",
      token,
      crypto.randomUUID(),
    );
    assert.ok(init.ok);
    const r = (await init.json()) as any;
    photos.push(r.session.photo_id);
    bytes[100] ^= 1;
    assert.ok(
      !(
        await fetch(r.grants[0].url, {
          method: "PUT",
          headers: r.grants[0].headers,
          body: bytes,
        })
      ).ok,
    );
    const secondEmail = await ask(
      "第二个成员的邮箱（留空则明确跳过真实跨账号测试）：",
    );
    if (secondEmail) {
      const second = await auth.auth.signInWithPassword({
        email: secondEmail,
        password: await password(),
      });
      if (second.error || !second.data.session)
        throw new Error("Second login failed");
      for (const pid of photos) {
        assert.equal(
          (
            await request(
              `/v1/photos/${pid}`,
              undefined,
              "GET",
              second.data.session.access_token,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `/v1/photos/${pid}/original-download`,
              {},
              "POST",
              second.data.session.access_token,
            )
          ).status,
          404,
        );
      }
      console.log("Cloud cross-account isolation passed.");
    } else console.log("Cloud cross-account isolation NOT RUN.");
    console.log(
      "Cloud smoke passed: PNG/HEIC byte preservation, MD5 rejection, replay protection, idempotent completion. This does not verify iPhone selectors or mainland networks.",
    );
  } finally {
    for (const id of photos) {
      await request(`/v1/photos/${id}`, undefined, "DELETE").catch(() => {});
    }
    await auth.auth.signOut();
    console.log(
      "Synthetic test photos marked for deletion; cleanup waits for PUT expiry. Run maintenance after expiry.",
    );
  }
}
main().catch(() => {
  console.error(
    "Cloud smoke FAILED or not configured; no claim of cloud readiness. Inspect account/configuration without logging credentials or signed URLs.",
  );
  process.exit(1);
});
