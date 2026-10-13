// Browser memory only. Object URLs disappear when this page/PWA process closes.
const LIMIT = 64 * 1024 * 1024;
const MAX_ENTRY = 8 * 1024 * 1024;
const images = new Map<string, { url: string; bytes: number }>();
const pending = new Map<string, Promise<string>>();
let used = 0;
let generation = 0;

export function cachedImage(id: string) {
  return images.get(id)?.url;
}

export function clearImageCache() {
  generation++;
  for (const image of images.values()) URL.revokeObjectURL(image.url);
  images.clear();
  pending.clear();
  used = 0;
}

export async function imageInSession(id: string, source: string): Promise<string> {
  const existing = cachedImage(id);
  if (existing) return existing;
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const task = (async () => {
    const started = generation;
    const response = await fetch(source, { cache: "no-store", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("IMAGE_UNAVAILABLE");
    const blob = await response.blob();
    if (started !== generation || blob.size > MAX_ENTRY || blob.size + used > LIMIT)
      return source; // Large previews keep the bounded memory cache small.
    const url = URL.createObjectURL(blob);
    images.set(id, { url, bytes: blob.size });
    used += blob.size;
    return url;
  })();
  pending.set(id, task);
  try { return await task; }
  finally { pending.delete(id); }
}
