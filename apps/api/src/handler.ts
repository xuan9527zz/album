import { z } from "zod";
import {
  uploadSchema,
  editSchema,
  type AssetSpec,
} from "../../../packages/shared/src/index";
import { md5Hex, sniff, type ObjectStore } from "./storage";
import { storyBodySchema } from "../../../packages/zine/src/schema";
export interface DB {
  call(name: string, args: Record<string, unknown>): Promise<any>;
}
export interface Dependencies {
  db: DB;
  store: ObjectStore;
  authenticate(token: string): Promise<string | null>;
  origins: string[];
  uploadTTL: number;
  readTTL: number;
  vapidPublicKey?: string;
  push?: (
    deliveries: Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
      kind: string;
      actor_name: string;
      photo_id: string | null;
    }>,
  ) => void;
}
const id = z.string().uuid();
const publicErrors: Record<string, [number, string]> = {
  NOT_MEMBER: [403, "此账号没有相册访问权限"],
  NOT_FOUND: [404, "照片或上传记录不可用"],
  RATE_LIMIT: [429, "操作较频繁，请稍后重试"],
  BUDGET_EXCEEDED: [409, "容量不足，请先清理或联系管理员"],
  IDEMPOTENCY_CONFLICT: [409, "重试请求的内容发生变化"],
  UPLOAD_EXPIRED: [409, "上传会话已过期或取消，请重新选择文件"],
  ROLE_EXISTS: [409, "此类素材已存在或仍在上传，请先恢复或取消原上传"],
  TOO_MANY_UPLOADS: [429, "未完成上传较多，请先完成或取消"],
  BAD_REQUEST: [400, "请求内容不正确"],
  ORIGINAL_REQUIRED: [400, "请同时选择一张静态原件"],
  IMMUTABLE_ORIGINAL: [409, "原件不能覆盖"],
  CHECKSUM_MISMATCH: [422, "文件校验未通过，请重试原件上传"],
  FILE_TYPE_MISMATCH: [422, "文件内容与格式不符"],
  STORAGE_UNAVAILABLE: [503, "文件服务暂不可用，请稍后重试"],
  COMMENT_LIMIT: [409, "这张照片的评论已达上限"],
  STORY_LIMIT: [409, "影集最多保存 50 本"],
  PUBLIC_OWN_PHOTOS_ONLY: [409, "公开观看链接只能包含你自己的照片"],
};
class APIError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail: string,
  ) {
    super(code);
  }
}
async function readJSON(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new APIError("BAD_REQUEST", 400, "缺少请求内容");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > 120000) {
      await reader.cancel();
      throw new APIError("BAD_REQUEST", 413, "请求内容过大");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createHandler(d: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const requestID = crypto.randomUUID();
    const origin = request.headers.get("Origin");
    const cors: Record<string, string> = {
      Vary: "Origin",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    const response = (data: unknown, status = 200) =>
      Response.json(data, { status, headers: cors });
    if (origin && !d.origins.includes(origin))
      return response(
        {
          error: { code: "ORIGIN_DENIED", message: "此页面来源未获授权" },
          request_id: requestID,
        },
        403,
      );
    if (origin) cors["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization,Content-Type,Idempotency-Key",
          "Access-Control-Max-Age": "600",
        },
      });
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/health" && request.method === "GET")
        return response({ status: "ok" });
      const publicStory = path.match(/^\/v1\/public\/stories\/([0-9a-f]{64})$/);
      if (publicStory && request.method === "GET") {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(publicStory[1]),
        );
        const tokenHash = Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        const { preview_assets, ...story } = await d.db.call(
          "album_story_public",
          { p_token_hash: tokenHash },
        );
        return response({
          ...story,
          urls: await Promise.all(
            preview_assets.map(async (asset: any) => ({
              id: asset.id,
              url: await d.store.grantGet(asset.object_key, d.readTTL),
            })),
          ),
        });
      }
      const bearer = request.headers
        .get("Authorization")
        ?.match(/^Bearer (.+)$/)?.[1];
      const owner = bearer ? await d.authenticate(bearer) : null;
      if (!owner)
        throw new APIError("UNAUTHENTICATED", 401, "登录已过期，请重新登录");
      const call = (action: string, data: unknown = {}) =>
        d.db.call("album_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const callV2 = (action: string, data: unknown = {}) =>
        d.db.call("album_v2_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const callV3 = (action: string, data: unknown = {}) =>
        d.db.call("album_v3_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const callV4 = (action: string, data: unknown = {}) =>
        d.db.call("album_v4_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const callV5 = (action: string, data: unknown = {}) =>
        d.db.call("album_v5_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const callV8 = (action: string, data: unknown = {}) =>
        d.db.call("album_v8_action", {
          p_owner: owner,
          p_action: action,
          p_data: data,
        });
      const pushEvent = async (sourceID: string) => {
        if (!d.push) return;
        try {
          d.push(await callV5("push_event", { source_id: sourceID }));
        } catch {
          /* A failed push must not undo a saved comment, like, or message. */
        }
      };
      const signedPreviews = async (
        photos: any[],
        trashed = false,
        detail = false,
      ) => {
        const ids = [
          ...new Set(
            photos
              .map((p) =>
                detail
                  ? p.assets.find((a: any) => a.role === "preview")?.id
                  : (
                      p.assets.find((a: any) => a.role === "thumbnail") ||
                      p.assets.find((a: any) => a.role === "preview")
                    )?.id,
              )
              .filter(Boolean),
          ),
        ];
        if (!ids.length) return [];
        const records = await callV3(trashed ? "read_trashed" : "read", {
          ids,
        });
        return Promise.all(
          records.map(async (a: any) => ({
            id: a.id,
            url: await d.store.grantGet(a.object_key, d.readTTL),
          })),
        );
      };
      const grants = async (sessionID: string) => {
        const items = await call("grants", {
          session_id: sessionID,
          ttl: d.uploadTTL + 30,
        });
        return Promise.all(
          items.map((i: any) =>
            d.store.grantPut(
              i.object_key,
              {
                role: i.role,
                filename: i.original_filename,
                mime: i.mime_type,
                size: Number(i.size_bytes),
                md5: i.md5,
                sha256: i.sha256,
                provenance: i.provenance,
              } as AssetSpec,
              i.id,
              d.uploadTTL,
            ),
          ),
        );
      };
      if (path === "/v1/me" && request.method === "GET")
        return response({
          ...(await callV3("summary")),
          ...(await callV2("profile_read")),
        });
      if (path === "/v1/me" && request.method === "PATCH") {
        const profile = z
          .object({
            display_name: z.string().trim().min(1).max(40).optional(),
            avatar_data_url: z
              .string()
              .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)
              .max(90000)
              .nullable()
              .optional(),
          })
          .strict()
          .refine((v) => Object.keys(v).length > 0)
          .parse(await readJSON(request));
        return response(await callV2("profile", profile));
      }
      if (path === "/v1/usage" && request.method === "GET")
        return response(await callV3("summary"));
      if (path === "/v1/members" && request.method === "GET")
        return response(await callV3("members"));
      const storyBody = storyBodySchema;
      if (path === "/v1/stories" && request.method === "GET") {
        const result = await callV8("list");
        const covers = result.stories
          .map((story: any) => story.cover_photo)
          .filter(Boolean);
        return response({
          stories: result.stories,
          urls: await signedPreviews(covers),
        });
      }
      if (path === "/v1/stories" && request.method === "POST")
        return response(
          await callV8("create", storyBody.parse(await readJSON(request))),
          201,
        );
      const storyMatch = path.match(/^\/v1\/stories\/([^/]+)$/);
      const storyShare = path.match(/^\/v1\/stories\/([^/]+)\/share$/);
      if (storyShare) {
        const storyID = id.parse(storyShare[1]);
        if (request.method === "GET")
          return response(await callV8("share_status", { story_id: storyID }));
        if (request.method === "DELETE")
          return response(await callV8("share_revoke", { story_id: storyID }));
        if (request.method === "POST") {
          const token = Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
            (value) => value.toString(16).padStart(2, "0"),
          ).join("");
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(token),
          );
          const tokenHash = Array.from(new Uint8Array(digest), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join("");
          return response({
            ...(await callV8("share_create", {
              story_id: storyID,
              token_hash: tokenHash,
            })),
            token,
          });
        }
      }
      if (storyMatch) {
        const storyID = id.parse(storyMatch[1]);
        if (request.method === "GET") {
          const story = await callV8("detail", { story_id: storyID });
          return response({
            ...story,
            urls: await signedPreviews(story.photos, false, true),
          });
        }
        if (request.method === "PATCH")
          return response(
            await callV8("update", {
              story_id: storyID,
              ...storyBody.parse(await readJSON(request)),
            }),
          );
        if (request.method === "DELETE")
          return response(await callV8("delete", { story_id: storyID }));
      }
      if (path === "/v1/notifications" && request.method === "GET")
        return response(await callV5("notifications"));
      if (path === "/v1/notifications/read" && request.method === "POST")
        return response(await callV5("notifications_read"));
      if (path === "/v1/chat" && request.method === "GET")
        return response(await callV5("chat_list"));
      if (path === "/v1/chat" && request.method === "POST") {
        const body = z
          .object({ body: z.string().trim().min(1).max(300) })
          .strict()
          .parse(await readJSON(request));
        const sent = await callV5("chat_send", body);
        await pushEvent(sent.id);
        return response(sent, 201);
      }
      if (path === "/v1/push/key" && request.method === "GET")
        return response({ public_key: d.vapidPublicKey || null });
      if (path === "/v1/push/subscription" && request.method === "POST") {
        const body = z
          .object({
            endpoint: z
              .url()
              .max(1500)
              .refine((value) => {
                const host = new URL(value).hostname;
                return (
                  new URL(value).protocol === "https:" &&
                  (host === "web.push.apple.com" ||
                    host.endsWith(".push.apple.com") ||
                    host === "fcm.googleapis.com" ||
                    host === "updates.push.services.mozilla.com" ||
                    host.endsWith(".push.services.mozilla.com"))
                );
              }),
            keys: z
              .object({
                p256dh: z.string().min(40).max(200),
                auth: z.string().min(10).max(100),
              })
              .strict(),
          })
          .strict()
          .parse(await readJSON(request));
        return response(
          await callV5("push_subscribe", {
            endpoint: body.endpoint,
            ...body.keys,
          }),
        );
      }
      if (path === "/v1/push/subscription" && request.method === "DELETE") {
        const body = z
          .object({ endpoint: z.url().max(1500) })
          .strict()
          .parse(await readJSON(request));
        return response(await callV5("push_unsubscribe", body));
      }
      if (path === "/v1/photos" && request.method === "GET") {
        const cursorParam = url.searchParams.get("cursor");
        const cursor = cursorParam
          ? z
              .object({
                sort_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                uploaded_at: z.string().datetime({ offset: true }),
                id,
              })
              .parse(JSON.parse(atob(cursorParam)))
          : undefined;
        const shared = url.searchParams.get("shared") === "true";
        const year = url.searchParams.get("year") || undefined;
        const month = url.searchParams.get("month") || undefined;
        const place = url.searchParams.get("place")?.trim() || undefined;
        const member = url.searchParams.get("owner") || undefined;
        if (year)
          z.string()
            .regex(/^(19|20|21)\d{2}$/)
            .parse(year);
        if (month)
          z.string()
            .regex(/^(0?[1-9]|1[0-2])$/)
            .parse(month);
        if (place) z.string().max(120).parse(place);
        if (member) id.parse(member);
        const photos = (
          await callV5("list", {
            shared,
            featured: !shared && url.searchParams.get("featured") === "true",
            limit: 24,
            ...(cursor ? { cursor } : {}),
            ...(year ? { year } : {}),
            ...(month ? { month } : {}),
            ...(place ? { place } : {}),
            ...(member ? { owner: member } : {}),
          })
        ).photos;
        const last = photos.at(-1);
        return response({
          photos,
          urls: await signedPreviews(photos),
          next_cursor:
            photos.length === 24
              ? btoa(
                  JSON.stringify({
                    sort_date: last.sort_date,
                    uploaded_at: last.uploaded_at,
                    id: last.id,
                  }),
                )
              : null,
        });
      }
      if (path === "/v1/photos/batch" && request.method === "POST") {
        const body = z
          .object({
            ids: z
              .array(id)
              .min(1)
              .max(50)
              .refine((ids) => new Set(ids).size === ids.length),
            operation: z.enum([
              "feature_on",
              "feature_off",
              "share_on",
              "share_off",
              "trash",
            ]),
          })
          .strict()
          .parse(await readJSON(request));
        return response(await callV3("batch", body));
      }
      if (path === "/v1/trash" && request.method === "GET") {
        const cursorParam = url.searchParams.get("cursor");
        const cursor = cursorParam
          ? z
              .object({
                deleted_at: z.string().datetime({ offset: true }),
                id,
              })
              .parse(JSON.parse(atob(cursorParam)))
          : undefined;
        const photos = (
          await callV3("trash_list", {
            limit: 24,
            ...(cursor ? { cursor } : {}),
          })
        ).photos;
        const last = photos.at(-1);
        return response({
          photos,
          urls: await signedPreviews(photos, true),
          next_cursor:
            photos.length === 24
              ? btoa(
                  JSON.stringify({ deleted_at: last.deleted_at, id: last.id }),
                )
              : null,
        });
      }
      const trashMatch = path.match(/^\/v1\/trash\/([^/]+)(?:\/(restore))?$/);
      if (trashMatch && trashMatch[1] !== "read-urls") {
        const photoID = id.parse(trashMatch[1]);
        if (trashMatch[2] === "restore" && request.method === "POST")
          return response(await callV3("restore", { photo_id: photoID }));
        if (!trashMatch[2] && request.method === "DELETE")
          return response(await callV3("purge", { photo_id: photoID }), 202);
      }
      const photoMatch = path.match(
        /^\/v1\/photos\/([^/]+)(?:\/(original-download|assets\/init|share|like))?$/,
      );
      if (photoMatch) {
        const photoID = id.parse(photoMatch[1]);
        const suffix = photoMatch[2];
        if (!suffix && request.method === "GET") {
          const photo = await callV5("photo", { photo_id: photoID });
          const [preview] = await signedPreviews([photo], false, true);
          return response({
            ...photo,
            ...(preview ? { preview_grant: preview } : {}),
          });
        }
        if (suffix === "share" && request.method === "POST")
          return response(
            await callV3("share", {
              photo_id: photoID,
              ...z
                .object({ is_shared: z.boolean() })
                .strict()
                .parse(await readJSON(request)),
            }),
          );
        if (suffix === "like" && request.method === "POST") {
          const body = z
            .object({ liked: z.boolean() })
            .strict()
            .parse(await readJSON(request));
          const updated = await callV5("like", { photo_id: photoID, ...body });
          if (body.liked) await pushEvent(photoID);
          return response(updated);
        }
        if (!suffix && request.method === "PATCH")
          return response(
            await callV5("edit", {
              photo_id: photoID,
              metadata: editSchema.parse(await readJSON(request)),
            }),
          );
        if (!suffix && request.method === "DELETE")
          return response(await callV3("trash", { photo_id: photoID }), 202);
        if (suffix === "original-download" && request.method === "POST") {
          const role = z
            .enum(["original_image", "live_video"])
            .parse((await readJSON(request)).role || "original_image");
          const object = await callV3("download", { photo_id: photoID, role });
          return response({
            url: await d.store.grantGet(
              object.object_key,
              d.readTTL,
              object.filename,
            ),
            filename: object.filename,
            expires_in: d.readTTL,
          });
        }
      }
      const commentMatch = path.match(
        /^\/v1\/photos\/([^/]+)\/comments(?:\/([^/]+))?$/,
      );
      if (commentMatch) {
        const photoID = id.parse(commentMatch[1]);
        const commentID = commentMatch[2] ? id.parse(commentMatch[2]) : null;
        if (!commentID && request.method === "GET")
          return response(await callV4("list", { photo_id: photoID }));
        if (!commentID && request.method === "POST") {
          const body = z
            .object({ body: z.string().trim().min(1).max(30) })
            .strict()
            .parse(await readJSON(request));
          const added = await callV4("add", { photo_id: photoID, ...body });
          await pushEvent(added.id);
          return response(added, 201);
        }
        if (commentID && request.method === "DELETE")
          return response(
            await callV4("delete", {
              photo_id: photoID,
              comment_id: commentID,
            }),
          );
      }
      if (
        (path === "/v1/uploads/init" || photoMatch?.[2] === "assets/init") &&
        request.method === "POST"
      ) {
        const parsed = uploadSchema.parse(await readJSON(request));
        const key = z
          .string()
          .min(8)
          .max(160)
          .parse(request.headers.get("Idempotency-Key"));
        const data = {
          ...parsed,
          ...(photoMatch ? { photo_id: id.parse(photoMatch[1]) } : {}),
        };
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(data)),
        );
        const digest = Array.from(new Uint8Array(bytes), (n) =>
          n.toString(16).padStart(2, "0"),
        ).join("");
        const s = await (photoMatch
          ? callV3("supplement", {
              ...data,
              key,
              digest,
            })
          : call("init", {
              ...data,
              key,
              digest,
            }));
        return response(
          { session: s, grants: s.state === "open" ? await grants(s.id) : [] },
          201,
        );
      }
      const sessionMatch = path.match(
        /^\/v1\/uploads\/([^/]+)(?:\/(refresh|cancel|assets\/([^/]+)\/complete))?$/,
      );
      if (sessionMatch) {
        const sessionID = id.parse(sessionMatch[1]);
        const suffix = sessionMatch[2];
        if (request.method === "GET" && !suffix)
          return response(await call("session", { session_id: sessionID }));
        if (request.method === "POST" && suffix === "refresh")
          return response({ grants: await grants(sessionID) });
        if (request.method === "POST" && suffix === "cancel")
          return response(await call("cancel", { session_id: sessionID }));
        if (request.method === "POST" && sessionMatch[3]) {
          const itemID = id.parse(sessionMatch[3]);
          const session = await call("session", { session_id: sessionID });
          const item = session.items.find((i: any) => i.id === itemID);
          if (!item) throw new Error("NOT_FOUND");
          if (item.state === "committed")
            return response(
              await call("photo", { photo_id: session.photo_id }),
            );
          // Fetch only server-generated keys, never accept a client key or byte count.
          const records = await call("grants", {
            session_id: sessionID,
            ttl: 0,
          });
          const record = records.find((i: any) => i.id === itemID);
          if (!record) throw new Error("NOT_FOUND");
          const head = await d.store.head(record.object_key);
          if (
            !head ||
            head.size !== Number(item.size_bytes) ||
            head.mime !== item.mime_type ||
            head.etag.toLowerCase() !== md5Hex(item.md5)
          )
            throw new Error("CHECKSUM_MISMATCH");
          if (
            !sniff(
              await d.store.range(record.object_key),
              item.mime_type,
              item.original_filename,
            )
          )
            throw new Error("FILE_TYPE_MISMATCH");
          return response(
            await call("complete", {
              session_id: sessionID,
              item_id: itemID,
              etag: head.etag,
            }),
          );
        }
      }
      if (
        (path === "/v1/assets/read-urls" || path === "/v1/trash/read-urls") &&
        request.method === "POST"
      ) {
        const body = z
          .object({
            ids: z
              .array(id)
              .min(1)
              .max(24)
              .refine((x) => new Set(x).size === x.length),
          })
          .strict()
          .parse(await readJSON(request));
        const records = await callV3(
          path.startsWith("/v1/trash") ? "read_trashed" : "read",
          { ids: body.ids },
        );
        return response({
          urls: await Promise.all(
            records.map(async (a: any) => ({
              id: a.id,
              url: await d.store.grantGet(a.object_key, d.readTTL),
            })),
          ),
        });
      }
      throw new APIError("NOT_FOUND", 404, "接口不可用");
    } catch (error) {
      if (error instanceof APIError)
        return response(
          {
            error: { code: error.code, message: error.detail },
            request_id: requestID,
          },
          error.status,
        );
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return response(
          {
            error: { code: "BAD_REQUEST", message: "请检查文件和输入内容" },
            request_id: requestID,
          },
          400,
        );
      const message = error instanceof Error ? error.message : "";
      const known = Object.keys(publicErrors).find(
        (code) => message === code || message.startsWith(`${code}:`),
      );
      const [status, detail] = known
        ? publicErrors[known]
        : [503, "服务暂时不可用，请稍后重试"];
      return response(
        {
          error: { code: known || "SERVICE_UNAVAILABLE", message: detail },
          request_id: requestID,
        },
        status,
      );
    }
  };
}
export async function cleanUp(db: DB, store: ObjectStore, dryRun = true) {
  const expiration = await db.call("album_v3_maintenance", {
    p_action: dryRun ? "due" : "expire",
    p_data: {},
  });
  const plan = await db.call("album_maintenance", {
    p_action: "plan",
    p_data: {},
  });
  let objects = 0;
  for (const [kind, entries] of [
    ["photo", plan.deletions],
    ["session", plan.sessions],
  ] as const)
    for (const entry of entries) {
      if (!dryRun) {
        for (const key of entry.keys) await store.remove(key);
        await db.call("album_maintenance", {
          p_action: `${kind}_done`,
          p_data: { id: entry.id },
        });
      }
      objects += entry.keys.length;
    }
  return {
    dry_run: dryRun,
    expired_due: Number(expiration.expired_due ?? expiration.expired),
    photos: plan.deletions.length,
    sessions: plan.sessions.length,
    objects,
  };
}
