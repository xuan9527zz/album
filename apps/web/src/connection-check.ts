import { boundedFetch } from "./connection-transport";
export type ConnectionTarget = {
  id: string;
  name: string;
  url: string;
  headers?: HeadersInit;
};
export type ConnectionResult = {
  id: string;
  name: string;
  code: string;
  text: string;
  ok: boolean;
  milliseconds: number;
};
export async function probeConnection(
  target: ConnectionTarget,
  fetcher: typeof fetch = (...args) => fetch(...args),
  timeout = 8000,
): Promise<ConnectionResult> {
  const start = performance.now();
  let code: string,
    text: string,
    ok = false;
  try {
    if (!target.url) {
      code = "NOT_CONFIGURED";
      text = "尚未配置";
    } else {
      const response = await boundedFetch(
        target.url,
        { headers: target.headers },
        timeout,
        fetcher,
      );
      const json = (response.headers.get("Content-Type") || "").includes(
        "json",
      );
      ok = response.ok && json;
      code =
        response.ok && !json
          ? "UNEXPECTED_RESPONSE"
          : "HTTP_" + response.status;
      text = ok
        ? "连接正常"
        : response.ok
          ? "响应内容异常"
          : `服务返回 HTTP ${response.status}`;
    }
  } catch (error) {
    const timedOut = (error as Error)?.name === "TimeoutError";
    code = timedOut ? "TIMEOUT" : "FETCH_FAILED";
    text = timedOut ? "连接超时" : "未能建立连接";
  }
  return {
    id: target.id,
    name: target.name,
    code,
    text,
    ok,
    milliseconds: Math.round(performance.now() - start),
  };
}
export function connectionReport(results: ConnectionResult[], time: string) {
  return [
    "唯味相册连接检查",
    time,
    ...results.map(
      (item) => `${item.name}: ${item.code} (${item.milliseconds}ms)`,
    ),
  ].join("\n");
}
