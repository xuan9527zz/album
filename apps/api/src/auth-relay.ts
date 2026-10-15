// Only the public Auth API is relayed. Never use the service-role key here.
type AuthRelayConfig = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ALLOWED_ORIGINS: string;
};
const methods: Record<string, string[]> = {
  "/auth/v1/token": ["POST"],
  "/auth/v1/user": ["GET", "PUT"],
  "/auth/v1/logout": ["POST"],
  "/auth/v1/verify": ["POST"],
  "/auth/v1/.well-known/jwks.json": ["GET"],
};
const MAX_BODY = 32768;

export async function relayAuth(
  request: Request,
  env: AuthRelayConfig,
  upstream: typeof fetch = (...args) => fetch(...args),
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/auth/v1/")) return null;
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const error = (code: string, status: number) =>
    Response.json({ code, message: code }, { status, headers });
  if (origin && !allowed.includes(origin)) return error("origin_denied", 403);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  const permitted = methods[url.pathname];
  if (!permitted) return error("not_found", 404);
  if (request.method === "OPTIONS") {
    headers.set(
      "Access-Control-Allow-Methods",
      permitted.join(",") + ",OPTIONS",
    );
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,apikey,X-Client-Info,X-Supabase-Api-Version",
    );
    headers.set("Access-Control-Max-Age", "600");
    return new Response(null, { status: 204, headers });
  }
  if (!permitted.includes(request.method))
    return error("method_not_allowed", 405);
  if (request.headers.get("apikey") !== env.SUPABASE_PUBLISHABLE_KEY)
    return error("invalid_api_key", 401);
  if (
    url.pathname === "/auth/v1/token" &&
    !["password", "refresh_token", "pkce"].includes(
      url.searchParams.get("grant_type") || "",
    )
  )
    return error("unsupported_grant_type", 400);
  const forwarded = new Headers({ apikey: env.SUPABASE_PUBLISHABLE_KEY });
  for (const name of [
    "Authorization",
    "Content-Type",
    "X-Client-Info",
    "X-Supabase-Api-Version",
  ])
    if (request.headers.has(name))
      forwarded.set(name, request.headers.get(name)!);
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (!["GET", "HEAD"].includes(request.method) && request.body) {
    if (Number(request.headers.get("Content-Length")) > MAX_BODY)
      return error("request_too_large", 413);
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          return error("request_too_large", 413);
        }
        chunks.push(chunk.value);
      }
    } catch {
      return error("request_unavailable", 400);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  try {
    const response = await upstream(
      env.SUPABASE_URL.replace(/\/$/, "") + url.pathname + url.search,
      {
        method: request.method,
        headers: forwarded,
        body,
        redirect: "manual",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      },
    );
    for (const name of [
      "Content-Type",
      "X-SB-Error-Code",
      "X-Supabase-Api-Version",
    ])
      if (response.headers.has(name))
        headers.set(name, response.headers.get(name)!);
    headers.set(
      "Access-Control-Expose-Headers",
      "X-SB-Error-Code,X-Supabase-Api-Version",
    );
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return error("auth_service_unavailable", 503);
  }
}

export function healthResponse(request: Request, origins: string): Response {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (
    origin &&
    origins
      .split(",")
      .map((value) => value.trim())
      .includes(origin)
  )
    headers.set("Access-Control-Allow-Origin", origin);
  return Response.json({ status: "ok" }, { headers });
}
