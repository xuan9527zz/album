import { expect, it, vi } from "vitest";
import { relayAuth, healthResponse } from "../apps/api/src/auth-relay";
const config = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  ALLOWED_ORIGINS: "https://xuan9527zz.github.io",
};
const headers = {
  Origin: config.ALLOWED_ORIGINS,
  apikey: config.SUPABASE_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
};
const base = "https://album.example";

it("relays public-key login and preserves Auth error codes without using admin credentials", async () => {
  const upstream = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe(
        config.SUPABASE_URL + "/auth/v1/token?grant_type=password",
      );
      expect(new Headers(init!.headers).get("apikey")).toBe(
        config.SUPABASE_PUBLISHABLE_KEY,
      );
      expect(new Headers(init!.headers).get("cookie")).toBeNull();
      expect(new TextDecoder().decode(init!.body as Uint8Array)).toContain(
        '"email":"test@example.com"',
      );
      return Response.json(
        { code: "invalid_credentials", message: "Invalid login credentials" },
        { status: 400 },
      );
    },
  );
  const result = await relayAuth(
    new Request(base + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { ...headers, Cookie: "not-forwarded" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "synthetic-password",
      }),
    }),
    config,
    upstream,
  );
  expect(result!.status).toBe(400);
  expect((await result!.json()).code).toBe("invalid_credentials");
  expect(result!.headers.get("Cache-Control")).toBe("no-store");
  expect(result!.headers.get("Access-Control-Allow-Origin")).toBe(
    config.ALLOWED_ORIGINS,
  );
});

it("rejects other origins, admin APIs, signups, unsupported grants and oversized bodies before forwarding", async () => {
  const upstream = vi.fn();
  for (const [path, init, status] of [
    ["/auth/v1/admin/users", { headers }, 404],
    ["/auth/v1/signup", { method: "POST", headers }, 404],
    [
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: { ...headers, Origin: "https://foreign.example" },
      },
      403,
    ],
    [
      "/auth/v1/token?grant_type=password",
      { method: "POST", headers: { ...headers, apikey: "wrong" } },
      401,
    ],
    ["/auth/v1/token?grant_type=other", { method: "POST", headers }, 400],
    ["/auth/v1/user", { method: "DELETE", headers }, 405],
    ["/auth/v1/user", { method: "PUT", headers, body: "x".repeat(32769) }, 413],
  ] as const) {
    expect(
      (await relayAuth(new Request(base + path, init), config, upstream))!
        .status,
    ).toBe(status);
  }
  expect(upstream).not.toHaveBeenCalled();
});

it("supports Auth CORS preflight and browser-readable health checks", async () => {
  const upstream = vi.fn();
  const result = await relayAuth(
    new Request(base + "/auth/v1/token", { method: "OPTIONS", headers }),
    config,
    upstream,
  );
  expect(result!.status).toBe(204);
  expect(result!.headers.get("Access-Control-Allow-Headers")).toContain(
    "apikey",
  );
  expect(
    healthResponse(
      new Request(base + "/health", { headers }),
      config.ALLOWED_ORIGINS,
    ).headers.get("Access-Control-Allow-Origin"),
  ).toBe(config.ALLOWED_ORIGINS);
  expect(upstream).not.toHaveBeenCalled();
});

it("returns a safe retryable error on upstream transport failure and leaves business routing alone", async () => {
  const upstream = vi.fn(async () => {
    throw new TypeError("private transport details");
  });
  const result = await relayAuth(
    new Request(base + "/auth/v1/user", { headers }),
    config,
    upstream,
  );
  expect(result!.status).toBe(503);
  expect(await result!.text()).not.toContain("private transport details");
  expect(
    await relayAuth(new Request(base + "/v1/photos"), config, upstream),
  ).toBeNull();
});
