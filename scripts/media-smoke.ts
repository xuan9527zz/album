import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { R2Store } from "../apps/api/src/storage";

const env = process.env;
for (const name of ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "SUPABASE_URL"])
  if (!env[name]) throw new Error(`Missing ${name}`);

const store = new R2Store({
  R2_ACCOUNT_ID: env.R2_ACCOUNT_ID!, R2_BUCKET_NAME: env.R2_BUCKET_NAME!,
  R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID!, R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY!,
});
const key = `smoke/${randomUUID()}.png`;
const bytes = randomBytes(1024 * 1024);
const gateway = `${env.SUPABASE_URL}/functions/v1/album-gateway/media?target=`;
try {
  const put = await store.grantPut(key, {
    role: "original_image", filename: "smoke.png", mime: "image/png", size: bytes.length,
    md5: createHash("md5").update(bytes).digest("base64"),
    sha256: createHash("sha256").update(bytes).digest("hex"), provenance: "file_imported",
  }, randomUUID(), 600);
  const upload = await fetch(gateway + encodeURIComponent(put.url), {
    method: "PUT", headers: put.headers, body: bytes,
  });
  if (!upload.ok) throw new Error(`Media upload returned ${upload.status}: ${(await upload.text()).slice(0, 300)}`);
  const signedGet = await store.grantGet(key, 300);
  const download = await fetch(gateway + encodeURIComponent(signedGet));
  assert.equal(download.status, 200);
  const received = Buffer.from(await download.arrayBuffer());
  assert.ok(received.equals(bytes));
  console.log(`Media gateway PUT/GET verified (${bytes.length} bytes)`);
} finally {
  await store.remove(key);
}
