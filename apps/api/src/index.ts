import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type {
  ScheduledController,
  ExecutionContext,
} from "@cloudflare/workers-types";
import { createHandler, cleanUp, type DB } from "./handler";
import { R2Store } from "./storage";
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  ALLOWED_ORIGINS: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  UPLOAD_TTL_SECONDS: string;
  READ_TTL_SECONDS: string;
}
export function productionDependencies(env: Env, ctx?: ExecutionContext) {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifier = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const db: DB = {
    async call(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    },
  };
  return {
    db,
    store: new R2Store(env),
    origins: env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()),
    uploadTTL: Math.min(Number(env.UPLOAD_TTL_SECONDS) || 600, 900),
    readTTL: Math.min(Number(env.READ_TTL_SECONDS) || 300, 300),
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    push: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT && ctx
      ? (deliveries: Array<{ endpoint: string; p256dh: string; auth: string; kind: string; actor_name: string; photo_id: string | null }>) => {
          webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
          ctx.waitUntil(Promise.allSettled(deliveries.map(async (entry) => {
            const body = entry.kind === "chat" ? `${entry.actor_name} 在家庭群聊发了消息`
              : `${entry.actor_name}${entry.kind === "like" ? "赞了" : "评论了"}你的共享照片`;
            const payload = JSON.stringify({ title: "唯味相册", body,
              route: entry.kind === "chat" ? "/messages" : `/photo/${entry.photo_id}/shared` });
            try {
              await webpush.sendNotification({ endpoint: entry.endpoint, keys: {
                p256dh: entry.p256dh, auth: entry.auth,
              } }, payload, { TTL: 3600, urgency: "normal" });
            } catch (error) {
              const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
              if (status === 404 || status === 410)
                await admin.from("push_subscriptions").delete().eq("endpoint", entry.endpoint);
            }
          })).then(() => undefined));
        }
      : undefined,
    async authenticate(token: string) {
      try {
        const { data, error } = await verifier.auth.getClaims(token);
        if (error || !data) return null;
        const c = data.claims;
        return c.iss === `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1` &&
          (c.aud === "authenticated" ||
            (Array.isArray(c.aud) && c.aud.includes("authenticated"))) &&
          c.exp > Date.now() / 1000 &&
          typeof c.sub === "string"
          ? c.sub
          : null;
      } catch {
        return null;
      }
    },
  };
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === "/health")
      return Response.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    const keys = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "ALLOWED_ORIGINS",
    ] as const;
    if (keys.some((k) => !env[k]))
      return Response.json(
        {
          error: {
            code: "CONFIGURATION_REQUIRED",
            message: "相册服务尚未配置",
          },
          request_id: crypto.randomUUID(),
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    return createHandler(productionDependencies(env, ctx))(request);
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    const d = productionDependencies(env);
    ctx.waitUntil(cleanUp(d.db, d.store, false).then(() => undefined));
  },
};
