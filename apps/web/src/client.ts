import { createClient } from "@supabase/supabase-js";
import { ConnectionTransport } from "./connection-transport";
export const localDemo =
  import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === "true";
export const inviteMarker = "album-invite-pending";
if (
  !localDemo &&
  ["invite", "recovery"].includes(
    new URLSearchParams(window.location.hash.slice(1)).get("type") || "",
  )
)
  sessionStorage.setItem(inviteMarker, "1");
const config = import.meta.env;
export const connection =
  !localDemo && config.VITE_API_BASE_URL && config.VITE_SUPABASE_URL
    ? new ConnectionTransport(
        config.VITE_API_BASE_URL.replace(/\/$/, ""),
        new URL(config.VITE_SUPABASE_URL).origin,
      )
    : null;
export const apiBase = () =>
  localDemo
    ? "http://127.0.0.1:8788"
    : connection?.base() || config.VITE_API_BASE_URL.replace(/\/$/, "");
export const configured =
  localDemo ||
  !!(
    config.VITE_SUPABASE_URL &&
    config.VITE_SUPABASE_PUBLISHABLE_KEY &&
    config.VITE_API_BASE_URL &&
    !config.VITE_SUPABASE_URL.includes("YOUR_")
  );
export const auth =
  configured && !localDemo
    ? createClient(
        config.VITE_SUPABASE_URL,
        config.VITE_SUPABASE_PUBLISHABLE_KEY,
        connection ? { global: { fetch: connection.authFetch } } : undefined,
      )
    : null;
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function publicRequest<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal,
  };
  const r = connection
    ? await connection.api(path, init)
    : await fetch(`${apiBase()}${path}`, init);
  const result = await r.json();
  if (!r.ok)
    throw new RequestError(
      result.error?.message || "观看链接不可用或已关闭",
      r.status,
    );
  return connection ? connection.mediaIn(result) : result;
}
export class Client {
  readonly controller = new AbortController();
  constructor(public userID: string) {}
  async token() {
    if (localDemo) return `demo:${this.userID}`;
    const session = await auth!.auth.getSession();
    if (!session.data.session) throw new Error("请重新登录");
    return session.data.session.access_token;
  }
  async request<T = any>(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
    key?: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await this.token();
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || this.controller.signal,
      cache: "no-store",
    };
    const r = connection
      ? await connection.api(path, init)
      : await fetch(`${apiBase()}${path}`, init);
    const data = await r.json();
    if (!r.ok)
      throw new RequestError(
        data.error?.message || "连接失败，请稍后重试",
        r.status,
      );
    return connection ? connection.mediaIn(data) : data;
  }
  async uploadMusic(
    file: File,
    progress: (percent: number) => void,
    saving: () => void,
    signal?: AbortSignal,
  ): Promise<{
    id: string;
    title: string;
    size_bytes: number;
    expires_at: string;
    expired: boolean;
  }> {
    const token = await this.token();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const clear = () => {
        this.controller.signal.removeEventListener("abort", abort);
        signal?.removeEventListener("abort", abort);
      };
      xhr.open("POST", `${apiBase()}/v1/music/uploads`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 300000;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          progress(
            Math.min(99, Math.floor((event.loaded / event.total) * 100)),
          );
      };
      xhr.upload.onload = saving;
      xhr.onload = () => {
        clear();
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300)
            throw new RequestError(
              result.error?.message || "MP3 上传失败",
              xhr.status,
            );
          progress(100);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = () => {
        clear();
        reject(new Error("上传连接中断，请重试"));
      };
      xhr.ontimeout = () => {
        clear();
        reject(new Error("MP3 上传超时，请重试"));
      };
      xhr.onabort = () => {
        clear();
        reject(new DOMException("已取消上传", "AbortError"));
      };
      if (this.controller.signal.aborted || signal?.aborted) {
        reject(new DOMException("已取消上传", "AbortError"));
        return;
      }
      this.controller.signal.addEventListener("abort", abort, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      const body = new FormData();
      body.set("file", file);
      xhr.send(body);
    });
  }
  stop() {
    this.controller.abort();
  }
}
