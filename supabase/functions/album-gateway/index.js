const FUNCTION_NAME = "album-gateway";
const ALLOWED_ORIGIN = "https://xuan9527zz.github.io";
const PUBLIC_GATEWAY_ORIGIN = "https://nqjdngemhgmahqjuuxwx.supabase.co";
const WORKER_ORIGIN = "https://family-album-api.xuan1996wyx.workers.dev";
const R2_ORIGIN = "https://65720088c3fb824c33ca1373a9f34f79.r2.cloudflarestorage.com";
const R2_BUCKET_PATH = "/family-album/";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,Content-MD5,If-None-Match,Cache-Control,Idempotency-Key,Range",
  "Access-Control-Expose-Headers": "Content-Disposition,Content-Length,Content-Range",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

function mediaTarget(raw) {
  if (!raw || raw.length > 4000) return null;
  try {
    const target = new URL(raw);
    if (target.origin !== R2_ORIGIN || !target.pathname.startsWith(R2_BUCKET_PATH) ||
        target.username || target.password || target.hash ||
        target.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
        !target.searchParams.has("X-Amz-Signature")) return null;
    return target;
  } catch {
    return null;
  }
}

function replaceSignedURLs(data) {
  if (Array.isArray(data)) return data.map(replaceSignedURLs);
  if (!data || typeof data !== "object") return data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    key,
    key === "url" && typeof value === "string" && mediaTarget(value)
      ? `${PUBLIC_GATEWAY_ORIGIN}/functions/v1/${FUNCTION_NAME}/media?target=${encodeURIComponent(value)}`
      : replaceSignedURLs(value),
  ]));
}

export async function handleAlbumGateway(request, upstreamFetch = fetch) {
  const origin = request.headers.get("Origin");
  const cors = origin === ALLOWED_ORIGIN ? CORS_HEADERS : {};
  if (origin && origin !== ALLOWED_ORIGIN)
    return Response.json({ error: { code: "ORIGIN_DENIED" } }, { status: 403 });

  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  const marker = `/${FUNCTION_NAME}/`;
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0)
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: cors });
  const path = url.pathname.slice(markerIndex + FUNCTION_NAME.length + 1);
  if (path === "/media") {
    if (request.method !== "GET" && request.method !== "PUT")
      return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405, headers: cors });
    const target = mediaTarget(url.searchParams.get("target"));
    if (!target)
      return Response.json({ error: { code: "BAD_MEDIA_TARGET" } }, { status: 400, headers: cors });
    const signedHeaders = (target.searchParams.get("X-Amz-SignedHeaders") || "").split(";");
    if (request.method === "PUT" &&
        !["content-md5", "content-type", "if-none-match"].every((name) => signedHeaders.includes(name)))
      return Response.json({ error: { code: "BAD_MEDIA_SIGNATURE" } }, { status: 400, headers: cors });
    const headers = new Headers();
    for (const name of ["Content-Type", "Content-MD5", "If-None-Match", "Cache-Control", "Range"])
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    try {
      const upstream = await upstreamFetch(target.toString(), {
        method: request.method,
        headers,
        body: request.method === "PUT" ? request.body : undefined,
        redirect: "manual",
      });
      const responseHeaders = new Headers(cors);
      for (const name of ["Content-Type", "Content-Disposition", "Content-Range", "Accept-Ranges", "ETag"])
        if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
      responseHeaders.set("Cache-Control", "no-store");
      responseHeaders.set("X-Content-Type-Options", "nosniff");
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return Response.json({ error: { code: "MEDIA_UNAVAILABLE" } },
        { status: 503, headers: { ...cors, "Cache-Control": "no-store" } });
    }
  }
  if (path !== "/health" && !path.startsWith("/v1/"))
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: cors });
  const publicRead = request.method === "GET" && /^\/v1\/public\/stories\/[0-9a-f]{64}$/.test(path);
  if (path !== "/health" && !publicRead && !request.headers.get("Authorization")?.startsWith("Bearer "))
    return Response.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401, headers: cors });

  const headers = new Headers();
  for (const name of ["Authorization", "Content-Type", "Idempotency-Key", "Origin"])
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  const target = `${WORKER_ORIGIN}${path}${url.search}`;
  try {
    const upstream = await upstreamFetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    const responseHeaders = new Headers(cors);
    for (const name of ["Content-Type", "Content-Disposition", "X-Content-Type-Options"])
      if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
    responseHeaders.set("Cache-Control", "no-store");
    const contentType = upstream.headers.get("Content-Type") || "";
    const body = upstream.ok && contentType.includes("application/json")
      ? JSON.stringify(replaceSignedURLs(await upstream.json()))
      : upstream.body;
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: { code: "UPSTREAM_UNAVAILABLE", message: "相册接口暂时无法连接" } },
      { status: 503, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }
}

if (typeof Deno !== "undefined") Deno.serve((request) => handleAlbumGateway(request));
