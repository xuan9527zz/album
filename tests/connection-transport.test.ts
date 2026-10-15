import { expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  boundedFetch,
  ConnectionTransport,
} from "../apps/web/src/connection-transport";
const primary = "https://example.supabase.co/functions/v1/album-gateway",
  auth = "https://example.supabase.co",
  backup = "https://album.example";
const login = auth + "/auth/v1/token?grant_type=password";

it("falls back through the real Auth SDK while preserving canonical sessions and credential payloads", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const token = [
    btoa(JSON.stringify({ alg: "none" })),
    btoa(
      JSON.stringify({
        iss: auth + "/auth/v1",
        sub: id,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
    "test",
  ].join(".");
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(auth)) throw new TypeError("Failed to fetch");
      expect(url).toBe(backup + "/auth/v1/token?grant_type=password");
      expect(new Headers(init?.headers).get("apikey")).toBe("public-key");
      const body = JSON.parse(
        new TextDecoder().decode(init?.body as ArrayBuffer),
      );
      expect(body).toMatchObject({
        email: "member@example.com",
        password: "synthetic-password",
      });
      return Response.json({
        access_token: token,
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id, aud: "authenticated", email: "member@example.com" },
      });
    },
  );
  const transport = new ConnectionTransport(primary, auth, backup, fetcher);
  const sdk = createClient(auth, "public-key", {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: transport.authFetch },
  });
  const result = await sdk.auth.signInWithPassword({
    email: "member@example.com",
    password: "synthetic-password",
  });
  expect(result.error).toBeNull();
  expect(result.data.user?.id).toBe(id);
  expect((await sdk.auth.getSession()).data.session?.access_token).toBe(token);
  expect(transport.base()).toBe(backup);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not mask invalid passwords or repeat an Auth validation error", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      { code: "invalid_credentials", message: "Invalid login credentials" },
      { status: 400, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
    ),
  );
  const transport = new ConnectionTransport(primary, auth, backup, fetcher);
  const result = await transport.authFetch(login, {
    method: "POST",
    body: "{}",
  });
  expect(result.status).toBe(400);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(transport.base()).toBe(primary);
  const sdk = createClient(auth, "public-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: transport.authFetch },
  });
  const loginResult = await sdk.auth.signInWithPassword({
    email: "test@example.com",
    password: "synthetic-password",
  });
  expect(loginResult.error?.code).toBe("invalid_credentials");
});

it("uses the alternate API for safe reads, preserves access checks and rewrites only signed family assets", async () => {
  const target =
    "https://65720088c3fb824c33ca1373a9f34f79.r2.cloudflarestorage.com/family-album/private/image?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test";
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer synthetic-token",
      );
      return String(input).startsWith(primary)
        ? new Response(null, { status: 503 })
        : Response.json({
            urls: [{ url: target }],
            avatar_url: target,
            title: "sample",
          });
    },
  );
  const transport = new ConnectionTransport(primary, auth, backup, fetcher);
  const response = await transport.api("/v1/photos", {
    headers: { Authorization: "Bearer synthetic-token" },
  });
  const data = transport.mediaIn(await response.json());
  expect(transport.base()).toBe(backup);
  expect(data.urls[0].url).toBe(
    backup + "/media?target=" + encodeURIComponent(target),
  );
  expect(data.avatar_url).toBe(data.urls[0].url);
  expect(data.title).toBe("sample");
  expect(
    transport.mediaURL(primary + "/media?target=" + encodeURIComponent(target)),
  ).toBe(data.avatar_url);
  expect(
    transport.mediaURL(target.replace("/family-album/", "/other-bucket/")),
  ).toContain("other-bucket");
  expect(transport.mediaURL("https://foreign.example/secret")).toBe(
    "https://foreign.example/secret",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("never replays ambiguous business writes or one-time invite/password edits", async () => {
  const fetcher = vi.fn(async () => {
    throw new TypeError("network lost");
  });
  for (const path of [
    "/auth/v1/verify",
    "/auth/v1/user",
    "/auth/v1/token?grant_type=refresh_token",
  ]) {
    const transport = new ConnectionTransport(primary, auth, backup, fetcher);
    await expect(
      transport.authFetch(auth + path, {
        method: path.endsWith("user") ? "PUT" : "POST",
        body: "{}",
      }),
    ).rejects.toThrow();
    expect(transport.base()).toBe(backup);
  }
  const transport = new ConnectionTransport(primary, auth, backup, fetcher);
  await expect(
    transport.api("/v1/stories", { method: "POST", body: "{}" }),
  ).rejects.toThrow();
  expect(transport.base()).toBe(backup);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("does not retry cancelled navigation, permission denials, or unrelated destinations", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted)
        throw new DOMException("cancelled", "AbortError");
      return new Response(null, { status: 401 });
    },
  );
  const transport = new ConnectionTransport(primary, auth, backup, fetcher);
  await expect(
    transport.api("/v1/photos", { signal: controller.signal }),
  ).rejects.toThrow();
  expect((await transport.api("/v1/photos")).status).toBe(401);
  expect(
    (await transport.authFetch("https://foreign.example/auth/v1/user")).status,
  ).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(transport.base()).toBe(primary);
});

it("times out a response stalled after headers and limits an unavailable request to two attempts", async () => {
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init!.signal!.addEventListener(
              "abort",
              () => controller.error(init!.signal!.reason),
              { once: true },
            );
          },
        }),
      ),
  );
  await expect(boundedFetch(primary, {}, 20, fetcher)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const unavailable = vi.fn(async () => {
    throw new TypeError("offline");
  });
  await expect(
    new ConnectionTransport(primary, auth, backup, unavailable).api(
      "/v1/photos",
    ),
  ).rejects.toThrow();
  expect(unavailable).toHaveBeenCalledTimes(2);
});
