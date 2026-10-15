import { z } from "zod";
import type { DB } from "./handler";
import type { MusicStore } from "./music-store";

const MAX = 20 * 1024 * 1024;
const uuid = z.string().uuid();
export async function musicStream(
  request: Request,
  db: DB,
  store?: MusicStore,
) {
  const match = new URL(request.url).pathname.match(
    /^\/v1\/music\/([0-9a-f-]{36})\/stream$/,
  );
  if (!match || !["GET", "HEAD"].includes(request.method)) return null;
  const id = uuid.parse(match[1]);
  const info = await db.call("album_music_action", {
    p_owner: null,
    p_action: "stream",
    p_data: { id },
  });
  if (!store) throw new Error("MUSIC_STORAGE_UNAVAILABLE");
  const range = request.headers.get("Range");
  if (range && (range.length > 100 || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)))
    throw new Error("BAD_REQUEST");
  const media = await store.read(Number(info.asset_id), range);
  if (![200, 206, 416].includes(media.status))
    throw new Error("MUSIC_STORAGE_UNAVAILABLE");
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  });
  for (const key of ["Content-Length", "Content-Range"])
    if (media.headers.has(key)) headers.set(key, media.headers.get(key)!);
  if (request.method === "HEAD") await media.body?.cancel();
  return new Response(request.method === "HEAD" ? null : media.body, {
    status: media.status,
    headers,
  });
}
export async function musicManage(
  request: Request,
  db: DB,
  owner: string,
  store?: MusicStore,
) {
  const path = new URL(request.url).pathname;
  const call = (action: string, data: unknown = {}) =>
    db.call("album_music_action", {
      p_owner: owner,
      p_action: action,
      p_data: data,
    });
  if (path === "/v1/music" && request.method === "GET")
    return Response.json({ ...(await call("list")), configured: !!store });
  if (path !== "/v1/music/uploads" || request.method !== "POST") return null;
  if (!store) throw new Error("MUSIC_CONFIGURATION_REQUIRED");
  await call("list");
  if (Number(request.headers.get("Content-Length")) > MAX + 8192)
    throw new Error("MUSIC_TOO_LARGE");
  if (
    !request.body ||
    !request.headers.get("Content-Type")?.startsWith("multipart/form-data;")
  )
    throw new Error("BAD_REQUEST");
  let received = 0,
    oversize = false;
  const limited = new Request(request, {
    body: request.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > MAX + 8192) {
            oversize = true;
            throw new Error("MUSIC_TOO_LARGE");
          }
          controller.enqueue(chunk);
        },
      }),
    ),
    duplex: "half",
  } as RequestInit);
  let data: FormData;
  try {
    data = await limited.formData();
  } catch {
    throw new Error(oversize ? "MUSIC_TOO_LARGE" : "BAD_REQUEST");
  }
  const file = data.get("file");
  if (
    !(file instanceof File) ||
    data.getAll("file").length !== 1 ||
    [...data.keys()].some((key) => key !== "file") ||
    !file.name.toLowerCase().endsWith(".mp3")
  )
    throw new Error("FILE_TYPE_MISMATCH");
  if (file.size > MAX) throw new Error("MUSIC_TOO_LARGE");
  if (file.size < 16) throw new Error("FILE_TYPE_MISMATCH");
  const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (
    !(prefix[0] === 73 && prefix[1] === 68 && prefix[2] === 51) &&
    !(prefix[0] === 255 && (prefix[1] & 0xe0) === 0xe0)
  )
    throw new Error("FILE_TYPE_MISMATCH");
  const title =
    file.name
      .replace(/\.mp3$/i, "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 100) || "配乐";
  const id = crypto.randomUUID();
  await call("reserve", { id, title, size: file.size });
  let asset: number | undefined;
  try {
    asset = await store.upload(id, file);
    return Response.json(await call("finish", { id, asset_id: asset }), {
      status: 201,
    });
  } catch (error) {
    // Keep the asset ID in the durable cleanup queue before attempting deletion.
    try {
      await call("abort", { id, ...(asset ? { asset_id: asset } : {}) });
    } finally {
      if (asset) {
        try {
          await store.remove(asset);
        } catch {
          /* The next scheduled cleanup retries. */
        }
      }
    }
    throw error;
  }
}
export async function cleanupMusic(db: DB, store: MusicStore) {
  const rows = await db.call("album_music_action", {
    p_owner: null,
    p_action: "cleanup_claim",
    p_data: {},
  });
  let removed = 0;
  for (const row of rows) {
    try {
      if (row.github_asset_id) await store.remove(Number(row.github_asset_id));
      await db.call("album_music_action", {
        p_owner: null,
        p_action: "cleanup_done",
        p_data: { id: row.id },
      });
      removed++;
    } catch {
      /* A failed delete remains claimed for five minutes, then retries. */
    }
  }
  if (store.reconcile) {
    const protectedAssets = await db.call("album_music_action", {
      p_owner: null,
      p_action: "asset_ids",
      p_data: {},
    });
    await store.reconcile(protectedAssets.map(Number));
  }
  return { due: rows.length, removed };
}
