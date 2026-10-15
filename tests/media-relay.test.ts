import { expect, it, vi } from "vitest";
import { relayMedia } from "../apps/api/src/media-relay";
const env = {
  R2_ACCOUNT_ID: "test-account",
  R2_BUCKET_NAME: "family-album",
  ALLOWED_ORIGINS: "https://xuan9527zz.github.io",
};
const signed =
  "https://test-account.r2.cloudflarestorage.com/family-album/private/image?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test&X-Amz-SignedHeaders=content-md5%3Bcontent-type%3Bif-none-match%3Bhost";
const path = (target = signed) =>
  "https://album.example/media?target=" + encodeURIComponent(target);
it("streams signed uploads and downloads without forwarding credentials or changing upstream access results", async () => {
  const upstream = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init!.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("cookie")).toBeNull();
      return new Response("bytes", {
        status: init!.method === "PUT" ? 200 : 403,
        headers: { "Content-Type": "image/png" },
      });
    },
  );
  for (const method of ["GET", "PUT"]) {
    const result = await relayMedia(
      new Request(path(), {
        method,
        headers: {
          Origin: env.ALLOWED_ORIGINS,
          Authorization: "Bearer never-forward",
          Cookie: "private",
          ...(method === "PUT"
            ? {
                "Content-Type": "image/png",
                "Content-MD5": "synthetic",
                "If-None-Match": "*",
              }
            : {}),
        },
        body: method === "PUT" ? "test" : undefined,
      }),
      env,
      upstream,
    );
    expect(result!.status).toBe(method === "PUT" ? 200 : 403);
    expect(result!.headers.get("Access-Control-Allow-Origin")).toBe(
      env.ALLOWED_ORIGINS,
    );
    expect(result!.headers.get("Cache-Control")).toBe("no-store");
  }
});
it("rejects arbitrary origins, accounts, buckets, unsigned targets and weak PUT signatures before fetching", async () => {
  const upstream = vi.fn();
  for (const target of [
    "https://foreign.example/",
    signed.replace("test-account", "another-account"),
    signed.replace("/family-album/", "/another-bucket/"),
    signed.replace("X-Amz-Signature=", "No-Signature="),
  ])
    expect(
      (await relayMedia(new Request(path(target)), env, upstream))!.status,
    ).toBe(400);
  expect(
    (await relayMedia(
      new Request(path(signed.replace("content-md5%3B", "")), {
        method: "PUT",
      }),
      env,
      upstream,
    ))!.status,
  ).toBe(400);
  expect(
    (await relayMedia(
      new Request(path(), { headers: { Origin: "https://foreign.example" } }),
      env,
      upstream,
    ))!.status,
  ).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
it("supports the media preflight and rejects non-media routing and methods", async () => {
  const upstream = vi.fn();
  const response = await relayMedia(
    new Request(path(), {
      method: "OPTIONS",
      headers: { Origin: env.ALLOWED_ORIGINS },
    }),
    env,
    upstream,
  );
  expect(response!.status).toBe(204);
  expect(response!.headers.get("Access-Control-Allow-Headers")).toContain(
    "Content-MD5",
  );
  expect(
    (await relayMedia(
      new Request(path(), { method: "DELETE" }),
      env,
      upstream,
    ))!.status,
  ).toBe(405);
  expect(
    await relayMedia(
      new Request("https://album.example/v1/photos"),
      env,
      upstream,
    ),
  ).toBeNull();
  expect(upstream).not.toHaveBeenCalled();
});
