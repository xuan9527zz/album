type MediaConfig = {
  R2_ACCOUNT_ID: string;
  R2_BUCKET_NAME: string;
  ALLOWED_ORIGINS: string;
};

export async function relayMedia(
  request: Request,
  env: MediaConfig,
  upstream: typeof fetch = (...args) => fetch(...args),
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/media") return null;
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = request.headers.get("Origin");
  const fail = (code: string, status: number) =>
    Response.json({ error: { code } }, { status, headers });
  if (
    origin &&
    !env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .includes(origin)
  )
    return fail("ORIGIN_DENIED", 403);
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type,Content-MD5,If-None-Match,Cache-Control,Range",
    );
    headers.set("Access-Control-Max-Age", "600");
    return new Response(null, { status: 204, headers });
  }
  if (!["GET", "PUT"].includes(request.method))
    return fail("METHOD_NOT_ALLOWED", 405);
  const raw = url.searchParams.get("target");
  if (!raw || raw.length > 4000) return fail("BAD_MEDIA_TARGET", 400);
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return fail("BAD_MEDIA_TARGET", 400);
  }
  if (
    target.origin !== `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` ||
    !target.pathname.startsWith(`/${env.R2_BUCKET_NAME}/`) ||
    target.username ||
    target.password ||
    target.hash ||
    target.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
    !target.searchParams.has("X-Amz-Signature")
  )
    return fail("BAD_MEDIA_TARGET", 400);
  const signed = (target.searchParams.get("X-Amz-SignedHeaders") || "").split(
    ";",
  );
  if (
    request.method === "PUT" &&
    !["content-md5", "content-type", "if-none-match"].every((key) =>
      signed.includes(key),
    )
  )
    return fail("BAD_MEDIA_SIGNATURE", 400);
  const forwarded = new Headers();
  for (const name of [
    "Content-Type",
    "Content-MD5",
    "If-None-Match",
    "Cache-Control",
    "Range",
  ])
    if (request.headers.has(name))
      forwarded.set(name, request.headers.get(name)!);
  if (request.method === "PUT" && request.headers.has("Content-Length"))
    forwarded.set("Content-Length", request.headers.get("Content-Length")!);
  try {
    const response = await upstream(target.toString(), {
      method: request.method,
      headers: forwarded,
      body: request.method === "PUT" ? request.body : undefined,
      redirect: "manual",
    });
    for (const name of [
      "Content-Type",
      "Content-Disposition",
      "Content-Range",
      "Accept-Ranges",
      "ETag",
    ])
      if (response.headers.has(name))
        headers.set(name, response.headers.get(name)!);
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Disposition,Content-Range,Accept-Ranges,ETag",
    );
    if (
      !response.headers.has("Content-Encoding") &&
      response.headers.has("Content-Length")
    )
      headers.set("Content-Length", response.headers.get("Content-Length")!);
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return fail("MEDIA_UNAVAILABLE", 503);
  }
}
