import { describe, expect, it, vi } from "vitest";
import { handleAlbumGateway } from "../supabase/functions/album-gateway/index.js";

const base = "https://example.supabase.co/functions/v1/album-gateway";
const origin = "https://xuan9527zz.github.io";

describe("album gateway", () => {
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
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer example");
    expect(await new Response(init.body).text()).toBe("{}");
  });

  it("rejects other browser origins and paths", async () => {
    const upstream = vi.fn();
    const originResponse = await handleAlbumGateway(
      new Request(`${base}/health`, { headers: { Origin: "https://other.example" } }),
      upstream,
    );
    const pathResponse = await handleAlbumGateway(
      new Request(`${base}/https://other.example`, { headers: { Origin: origin } }),
      upstream,
    );
    expect(originResponse.status).toBe(403);
    expect(pathResponse.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
