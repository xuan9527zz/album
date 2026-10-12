import { AwsClient } from "aws4fetch";
import type { AssetSpec, Grant } from "../../../packages/shared/src/index";
export interface StoredHead {
  size: number;
  mime: string;
  etag: string;
}
export interface ObjectStore {
  grantPut(
    key: string,
    item: AssetSpec,
    id: string,
    ttl: number,
  ): Promise<Grant>;
  grantGet(key: string, ttl: number, filename?: string): Promise<string>;
  head(key: string): Promise<StoredHead | null>;
  range(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}
export class R2Store implements ObjectStore {
  private client: AwsClient;
  constructor(
    private env: {
      R2_ACCOUNT_ID: string;
      R2_BUCKET_NAME: string;
      R2_ACCESS_KEY_ID: string;
      R2_SECRET_ACCESS_KEY: string;
    },
  ) {
    this.client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
  }
  private url(key: string) {
    return new URL(
      `https://${this.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(this.env.R2_BUCKET_NAME)}/${key.split("/").map(encodeURIComponent).join("/")}`,
    );
  }
  async grantPut(key: string, item: AssetSpec, id: string, ttl: number) {
    const url = this.url(key);
    url.searchParams.set("X-Amz-Expires", String(ttl));
    const headers = {
      "Content-Type": item.mime,
      "Content-MD5": item.md5,
      "Content-Length": String(item.size),
      "If-None-Match": "*",
      "Cache-Control": "no-store",
    };
    const signed = await this.client.sign(url, {
      method: "PUT",
      headers,
      aws: { signQuery: true, allHeaders: true },
    });
    // Content-Length is a forbidden browser header, emitted by the user agent from Blob.size.
    const { "Content-Length": _, ...browserHeaders } = headers;
    return {
      asset_id: id,
      url: signed.url,
      headers: browserHeaders,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
  async grantGet(key: string, ttl: number, filename?: string) {
    const url = this.url(key);
    url.searchParams.set("X-Amz-Expires", String(ttl));
    if (filename)
      url.searchParams.set(
        "response-content-disposition",
        `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      );
    return (
      await this.client.sign(url, { method: "GET", aws: { signQuery: true } })
    ).url;
  }
  async head(key: string) {
    const r = await this.client.fetch(this.url(key), { method: "HEAD" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("STORAGE_UNAVAILABLE");
    return {
      size: Number(r.headers.get("content-length")),
      mime: r.headers.get("content-type") || "",
      etag: (r.headers.get("etag") || "").replaceAll('"', ""),
    };
  }
  async range(key: string) {
    const r = await this.client.fetch(this.url(key), {
      headers: { Range: "bytes=0-65535" },
    });
    if (
      !r.ok ||
      (r.status !== 206 && Number(r.headers.get("content-length")) > 65536)
    ) {
      await r.body?.cancel();
      throw new Error("STORAGE_UNAVAILABLE");
    }
    return new Uint8Array(await r.arrayBuffer());
  }
  async remove(key: string) {
    const r = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error("STORAGE_UNAVAILABLE");
  }
  async stream(key: string) {
    const r = await this.client.fetch(this.url(key));
    if (!r.ok || !r.body) throw new Error("STORAGE_UNAVAILABLE");
    return r.body;
  }
  async *list() {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const url = this.url("");
      url.searchParams.set("list-type", "2");
      url.searchParams.set("max-keys", "1000");
      if (cursor) url.searchParams.set("continuation-token", cursor);
      const response = await this.client.fetch(url);
      if (!response.ok) throw new Error("STORAGE_UNAVAILABLE");
      const xml = await response.text();
      const decode = (s: string) =>
        s
          .replaceAll("&amp;", "&")
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&quot;", '"')
          .replaceAll("&apos;", "'");
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = match[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
        const size = match[1].match(/<Size>(\d+)<\/Size>/)?.[1];
        if (key !== undefined && size !== undefined)
          yield { key: decode(key), size: Number(size) };
      }
      cursor = xml.match(
        /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/,
      )?.[1];
      if (cursor) cursor = decode(cursor);
      if (++pages > 50) throw new Error("INVENTORY_PAGE_LIMIT");
    } while (cursor);
  }
}
export function sniff(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): boolean {
  const text = new TextDecoder("latin1").decode(bytes.slice(0, 64));
  const ext = filename.split(".").at(-1)?.toLowerCase();
  if (mime === "image/jpeg")
    return (
      ["jpg", "jpeg"].includes(ext || "") &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === "image/png")
    return (
      ext === "png" &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    );
  if (text.slice(4, 8) !== "ftyp") return false;
  const brands = text.slice(8);
  if (["image/heic", "image/heif"].includes(mime))
    return (
      ["heic", "heif", "hif"].includes(ext || "") &&
      /heic|heix|hevc|hevx|mif1|msf1/.test(brands)
    );
  return (
    (mime === "video/quicktime" &&
      ext === "mov" &&
      /qt  |isom|mp4[12]/.test(brands)) ||
    (mime === "video/mp4" &&
      ext === "mp4" &&
      /isom|iso[2-6]|mp4[12]|avc1/.test(brands))
  );
}
export function md5Hex(base64: string) {
  return Array.from(atob(base64), (c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}
