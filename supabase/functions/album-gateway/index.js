const FUNCTION_NAME = "album-gateway";
const ALLOWED_ORIGIN = "https://xuan9527zz.github.io";
const WORKER_ORIGIN = "https://family-album-api.xuan1996wyx.workers.dev";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

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
  if (path !== "/health" && !path.startsWith("/v1/"))
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers: cors });
  if (path !== "/health" && !request.headers.get("Authorization")?.startsWith("Bearer "))
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
    return new Response(upstream.body, {
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
