import { afterEach, expect, it, vi } from "vitest";
import { cachedImage, clearImageCache, imageInSession } from "../apps/web/src/session-image-cache";

afterEach(() => { clearImageCache(); vi.restoreAllMocks(); });

it("reuses a decoded image during one page session even when its signed URL changes", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob(["image"], { type: "image/png" }), { status: 200 }),
  );
  const first = await imageInSession("asset-1", "https://example.com/first-signature");
  const again = await imageInSession("asset-1", "https://example.com/new-signature");
  expect(first).toBe(again);
  expect(cachedImage("asset-1")).toBe(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  clearImageCache();
  expect(cachedImage("asset-1")).toBeUndefined();
});
