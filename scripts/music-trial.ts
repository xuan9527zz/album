import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

// This server only runs behind the 127.0.0.1 development demo. Never copy the
// supplied sample to public assets or expose a client-selected filesystem path.
export async function localMusicTrial(
  file = process.env.ALBUM_MUSIC_TRIAL_FILE,
) {
  const body = await readFile(
    file || new URL("../tests/fixtures/audio-tone.mp3", import.meta.url),
  );
  if (body.length > 40 * 1024 * 1024)
    throw new Error("Audio trial file exceeds 40 MB");
  const mime = "audio/mpeg";
  const stalled = new Set<string>();
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, "http://127.0.0.1:8788");
    if (url.pathname !== "/__music-trial/audio" || req.method !== "GET")
      return false;
    if (url.searchParams.has("invalid")) {
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": 10,
        "Cache-Control": "no-store",
      });
      res.end("bad music!");
      return true;
    }
    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    const stall = url.searchParams.get("stall");
    if (stall && !stalled.has(stall)) {
      stalled.add(stall);
      res.write(body.subarray(0, 1024));
      return true;
    }
    let offset = 0;
    const timer = setInterval(() => {
      const end = Math.min(body.length, offset + 65536);
      res.write(body.subarray(offset, end));
      offset = end;
      if (offset === body.length) res.end();
    }, 80);
    res.on("close", () => clearInterval(timer));
    return true;
  };
}
