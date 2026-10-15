import { expect, it, vi } from "vitest";
import {
  connectionReport,
  probeConnection,
} from "../apps/web/src/connection-check";
const target = {
  id: "auth",
  name: "登录服务",
  url: "https://example.supabase.co/auth/v1/health",
  headers: { apikey: "synthetic-public-key" },
};
it("distinguishes connection failure, HTTP rejection and unexpected responses without exposing keys or request details", async () => {
  const ready = await probeConnection(
    target,
    vi.fn(async () => Response.json({ version: "test" })),
  );
  expect(ready).toMatchObject({ code: "HTTP_200", ok: true });
  const rejected = await probeConnection(
    target,
    vi.fn(async () => Response.json({ code: "wrong_key" }, { status: 401 })),
  );
  expect(rejected).toMatchObject({ code: "HTTP_401", ok: false });
  expect(
    await probeConnection(
      target,
      vi.fn(async () => new Response("challenge page")),
    ),
  ).toMatchObject({ code: "UNEXPECTED_RESPONSE", ok: false });
  const failure = await probeConnection(
    target,
    vi.fn(async () => {
      throw new TypeError("private connection details");
    }),
  );
  expect(failure).toMatchObject({ code: "FETCH_FAILED", ok: false });
  const report = connectionReport(
    [ready, rejected, failure],
    "2026-10-15T00:00:00Z",
  );
  for (const value of [
    target.url,
    "synthetic-public-key",
    "private connection details",
  ])
    expect(report).not.toContain(value);
});
it("reports timeout separately from an unconfigured endpoint", async () => {
  expect(await probeConnection({ ...target, url: "" }, vi.fn())).toMatchObject({
    code: "NOT_CONFIGURED",
    ok: false,
  });
  expect(
    await probeConnection(
      target,
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    ),
  ).toMatchObject({ code: "TIMEOUT", ok: false });
});
