export const BACKUP_API = "https://family-album-api.xuan1996wyx.workers.dev";
const R2_ORIGIN =
  "https://65720088c3fb824c33ca1373a9f34f79.r2.cloudflarestorage.com";

// Small JSON requests only. Keep the deadline through response-body reading;
// a connection that sends headers and then stalls is still a failed attempt.
export async function boundedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeout = 10000,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("请求超时", "TimeoutError")),
    timeout,
  );
  try {
    const response = await fetcher(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    const body = await response.arrayBuffer();
    const headers = new Headers(response.headers);
    headers.delete("Content-Encoding");
    headers.delete("Content-Length");
    return new Response(
      [204, 205, 304].includes(response.status) || init.method === "HEAD"
        ? null
        : body,
      { status: response.status, statusText: response.statusText, headers },
    );
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export class ConnectionTransport {
  private preferred: string;
  constructor(
    readonly primary: string,
    readonly authOrigin: string,
    readonly backup = BACKUP_API,
    private fetcher: typeof fetch = (...args) => fetch(...args),
    private timeout = 10000,
  ) {
    this.preferred = primary.replace(/\/$/, "");
  }
  base() {
    return this.preferred;
  }
  private other(base: string) {
    return base === this.backup ? this.primary : this.backup;
  }
  private async send(url: string, init: RequestInit) {
    return boundedFetch(url, init, this.timeout, this.fetcher);
  }
  async api(path: string, init: RequestInit = {}) {
    const first = this.preferred,
      second = this.other(first);
    const canRetry = ["GET", "HEAD"].includes(init.method || "GET");
    let response: Response;
    try {
      response = await this.send(first + path, init);
      if (!canRetry || response.status < 500) return response;
    } catch (error) {
      if (init.signal?.aborted) throw error;
      if (!canRetry) {
        this.preferred = second;
        throw error;
      }
    }
    const result = await this.send(second + path, init);
    if (result.status < 500) this.preferred = second;
    return result;
  }
  authFetch: typeof fetch = async (input, init = {}) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    // Keep Supabase's canonical URL and session storage key. Only transport
    // changes, and only to our existing first-party Worker, never a user URL.
    if (
      url.origin !== this.authOrigin ||
      !/^\/auth\/v1\/(token|user|logout|verify|\.well-known\/jwks\.json)$/.test(
        url.pathname,
      )
    )
      return this.fetcher(input, init);
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    const options: RequestInit = {
      method: request.method,
      headers: request.headers,
      body,
      signal: request.signal,
    };
    const direct = url.toString(),
      relay = this.backup + url.pathname + url.search;
    const backupFirst = this.preferred === this.backup;
    const targets = backupFirst ? [relay, direct] : [direct, relay];
    // Do not replay rotating refresh tokens, one-time invite verification,
    // or password/profile edits. The SDK owns refresh-token retry policy.
    const retry =
      request.method === "GET" ||
      (url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password");
    try {
      const response = await this.send(targets[0], options);
      if (response.status < 500 || !retry) return response;
    } catch (error) {
      if (request.signal.aborted) throw error;
      if (!retry) {
        this.preferred = backupFirst ? this.primary : this.backup;
        throw error;
      }
    }
    const response = await this.send(targets[1], options);
    if (response.status < 500)
      this.preferred = backupFirst ? this.primary : this.backup;
    return response;
  };
  mediaURL(value: string): string {
    if (this.preferred !== this.backup) return value;
    try {
      let target = new URL(value);
      const primary = new URL(this.primary);
      if (
        target.origin === primary.origin &&
        target.pathname === primary.pathname + "/media"
      )
        target = new URL(target.searchParams.get("target") || "");
      if (
        target.origin === R2_ORIGIN &&
        target.pathname.startsWith("/family-album/") &&
        !target.username &&
        !target.password &&
        !target.hash &&
        target.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" &&
        target.searchParams.has("X-Amz-Signature")
      )
        return (
          this.backup + "/media?target=" + encodeURIComponent(target.toString())
        );
    } catch {
      /* Ordinary text and unrelated URLs are unchanged. */
    }
    return value;
  }
  mediaIn<T>(data: T): T {
    if (typeof data === "string") return this.mediaURL(data) as T;
    if (Array.isArray(data)) return data.map((item) => this.mediaIn(item)) as T;
    if (data && typeof data === "object")
      return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, this.mediaIn(value)]),
      ) as T;
    return data;
  }
}
