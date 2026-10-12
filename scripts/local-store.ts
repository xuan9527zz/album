import { createHash } from "node:crypto";
import type { ObjectStore } from "../apps/api/src/storage";
import type { AssetSpec, Grant } from "../packages/shared/src/index";
export class LocalStore implements ObjectStore {
  objects = new Map<string, { body: Uint8Array; mime: string; etag: string }>();
  permissions = new Map<
    string,
    {
      key: string;
      method: string;
      item?: AssetSpec;
      filename?: string;
      expiry: number;
    }
  >();
  constructor(public baseURL = "http://127.0.0.1:8788") {}
  async grantPut(
    key: string,
    item: AssetSpec,
    id: string,
    ttl: number,
  ): Promise<Grant> {
    const token = crypto.randomUUID();
    this.permissions.set(token, {
      key,
      method: "PUT",
      item,
      expiry: Date.now() + ttl * 1000,
    });
    return {
      asset_id: id,
      url: `${this.baseURL}/local-object/${token}`,
      headers: {
        "Content-Type": item.mime,
        "Content-MD5": item.md5,
        "If-None-Match": "*",
        "Cache-Control": "no-store",
      },
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }
  async grantGet(key: string, ttl: number, filename?: string) {
    const token = crypto.randomUUID();
    this.permissions.set(token, {
      key,
      method: "GET",
      filename,
      expiry: Date.now() + ttl * 1000,
    });
    return `${this.baseURL}/local-object/${token}`;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.body.length, mime: o.mime, etag: o.etag } : null;
  }
  async range(key: string) {
    return this.objects.get(key)!.body.slice(0, 65536);
  }
  async remove(key: string) {
    this.objects.delete(key);
  }
  async fetch(request: Request) {
    const cors = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
      "Access-Control-Allow-Methods": "PUT,GET,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Content-MD5,If-None-Match,Cache-Control",
      "Cache-Control": "no-store",
    };
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors, status: 204 });
    const permission = this.permissions.get(
      new URL(request.url).pathname.split("/").at(-1)!,
    );
    if (
      !permission ||
      permission.expiry < Date.now() ||
      permission.method !== request.method
    )
      return new Response(null, { status: 403, headers: cors });
    if (request.method === "GET") {
      const o = this.objects.get(permission.key);
      const safe = permission.filename?.replace(/[^a-zA-Z0-9._-]/g, "_");
      return o
        ? new Response(o.body as BodyInit, {
            headers: {
              ...cors,
              "Content-Type": o.mime,
              ...(permission.filename
                ? {
                    "Content-Disposition": `attachment;filename="${safe}";filename*=UTF-8''${encodeURIComponent(permission.filename)}`,
                  }
                : {}),
            },
          })
        : new Response(null, { status: 404, headers: cors });
    }
    if (request.headers.get("If-None-Match") !== "*")
      return new Response(null, { status: 403, headers: cors });
    if (this.objects.has(permission.key))
      return new Response(null, { status: 412, headers: cors });
    const body = new Uint8Array(await request.arrayBuffer());
    const item = permission.item!;
    const md5 = createHash("md5").update(body).digest();
    if (
      body.length !== item.size ||
      request.headers.get("Content-Type") !== item.mime ||
      request.headers.get("Content-MD5") !== item.md5 ||
      md5.toString("base64") !== item.md5
    )
      return new Response(null, { status: 400, headers: cors });
    this.objects.set(permission.key, {
      body,
      mime: item.mime,
      etag: md5.toString("hex"),
    });
    return new Response(null, { status: 200, headers: cors });
  }
}
