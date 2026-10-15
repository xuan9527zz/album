import type { MusicStore } from "../apps/api/src/music-store";
export class LocalMusicStore implements MusicStore {
  constructor(private delay = 0) {}
  files = new Map<number, Uint8Array<ArrayBuffer>>();
  next = 1;
  async upload(_id: string, file: File) {
    if(this.delay)await new Promise(resolve=>setTimeout(resolve,this.delay));
    const id = this.next++;
    this.files.set(id, new Uint8Array(await file.arrayBuffer()));
    return id;
  }
  async remove(id: number) {
    this.files.delete(id);
  }
  async read(id: number, range?: string | null) {
    const bytes = this.files.get(id);
    if (!bytes) return new Response(null, { status: 404 });
    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.length),
      "Accept-Ranges": "bytes",
    });
    if (!range) return new Response(bytes, { headers });
    const match = range.match(/^bytes=(\d*)-(\d*)$/)!;
    const start = match[1]
      ? Number(match[1])
      : Math.max(0, bytes.length - Number(match[2]));
    const end = match[1]
      ? match[2]
        ? Math.min(bytes.length - 1, Number(match[2]))
        : bytes.length - 1
      : bytes.length - 1;
    if (start > end || start >= bytes.length)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    headers.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(bytes.slice(start, end + 1), { status: 206, headers });
  }
}
