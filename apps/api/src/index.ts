import { createClient } from "@supabase/supabase-js";
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
  UPLOAD_TTL_SECONDS: string;
  READ_TTL_SECONDS: string;
}
export function productionDependencies(env: Env) {
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
  async fetch(request: Request, env: Env) {
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
    return createHandler(productionDependencies(env))(request);
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
