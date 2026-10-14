import { describe, expect, it, vi } from "vitest";
import { handleAlbumGateway } from "../supabase/functions/album-gateway/index.js";

const base = "https://example.supabase.co/functions/v1/album-gateway";
const origin = "https://xuan9527zz.github.io";

describe("album gateway", () => {
  it("allows anonymous token-protected story GET only while keeping writes authenticated", async () => {
    const upstream = vi.fn(async () => Response.json({ title: "影集" }));
    const path = `${base}/v1/public/stories/${"a".repeat(64)}`;
    expect((await handleAlbumGateway(new Request(path), upstream)).status).toBe(
      200,
    );
    expect(
      (
        await handleAlbumGateway(
          new Request(path, { method: "POST" }),
          upstream,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleAlbumGateway(
          new Request(`${base}/v1/public/stories/guess`),
          upstream,
        )
      ).status,
    ).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("forwards health to the fixed Worker", async () => {
    const upstream = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ status: "ok" }),
    );
    const response = await handleAlbumGateway(
      new Request(`${base}/health`, { headers: { Origin: origin } }),
      upstream,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(upstream.mock.calls[0][0]).toBe(
      "https://family-album-api.xuan1996wyx.workers.dev/health",
    );
  });

  it("requires a bearer token for album data", async () => {
    const upstream = vi.fn();
    const response = await handleAlbumGateway(
      new Request(`${base}/v1/photos`, { headers: { Origin: origin } }),
      upstream,
    );
    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("forwards only expected headers and preserves the path and body", async () => {
    const upstream = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ photos: [] }),
    );
    const response = await handleAlbumGateway(
      new Request(`${base}/v1/photos?limit=20`, {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: "Bearer example",
          "Content-Type": "application/json",
          Cookie: "private=do-not-forward",
        },
        body: "{}",
      }),
      upstream,
    );
    expect(response.status).toBe(200);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(
      "https://family-album-api.xuan1996wyx.workers.dev/v1/photos?limit=20",
    );
    expect(new Headers(init.headers).get("Cookie")).toBeNull();
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer example",
    );
    expect(await new Response(init.body).text()).toBe("{}");
  });

  it("rejects other browser origins and paths", async () => {
    const upstream = vi.fn();
    const originResponse = await handleAlbumGateway(
      new Request(`${base}/health`, {
        headers: { Origin: "https://other.example" },
      }),
      upstream,
    );
    const pathResponse = await handleAlbumGateway(
      new Request(`${base}/https://other.example`, {
        headers: { Origin: origin },
      }),
      upstream,
    );
    expect(originResponse.status).toBe(403);
    expect(pathResponse.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("routes signed image and upload URLs through the same reachable hostname", async () => {
    const signed =
      "https://65720088c3fb824c33ca1373a9f34f79.r2.cloudflarestorage.com/family-album/photo/a.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-SignedHeaders=content-md5%3Bcontent-type%3Bif-none-match&X-Amz-Signature=abc";
    const upstream = vi.fn(async () =>
      Response.json({
        urls: [{ id: "a", url: signed }],
        grants: [{ url: signed, headers: { "Content-MD5": "abc" } }],
      }),
    );
    // Supabase can pass its internal HTTP URL to Edge Functions behind the public HTTPS proxy.
    const response = await handleAlbumGateway(
      new Request(
        "http://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway/v1/assets/read-urls",
        {
          method: "POST",
          headers: { Origin: origin, Authorization: "Bearer example" },
          body: "{}",
        },
      ),
      upstream,
    );
    const data = await response.json();
    expect(data.urls[0].url).toBe(
      `https://nqjdngemhgmahqjuuxwx.supabase.co/functions/v1/album-gateway/media?target=${encodeURIComponent(signed)}`,
    );
    expect(data.grants[0].url).toBe(data.urls[0].url);
    expect(data.grants[0].headers["Content-MD5"]).toBe("abc");
  });

  it("streams a signed PUT while rejecting arbitrary media targets", async () => {
    const signed =
      "https://65720088c3fb824c33ca1373a9f34f79.r2.cloudflarestorage.com/family-album/test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-SignedHeaders=content-md5%3Bcontent-type%3Bif-none-match&X-Amz-Signature=abc";
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("PUT");
      expect(new Headers(init.headers).get("Content-MD5")).toBe("checksum");
      expect(await new Response(init.body).text()).toBe("image bytes");
      return new Response(null, { status: 200 });
    });
    const response = await handleAlbumGateway(
      new Request(`${base}/media?target=${encodeURIComponent(signed)}`, {
        method: "PUT",
        headers: {
          Origin: origin,
          "Content-Type": "image/png",
          "Content-MD5": "checksum",
          "If-None-Match": "*",
        },
        body: "image bytes",
        duplex: "half",
      } as RequestInit),
      upstream,
    );
    expect(response.status).toBe(200);
    const rejected = await handleAlbumGateway(
      new Request(
        `${base}/media?target=${encodeURIComponent("https://evil.example/steal")}`,
        { headers: { Origin: origin } },
      ),
      upstream,
    );
    expect(rejected.status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
