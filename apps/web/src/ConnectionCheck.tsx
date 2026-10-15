import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, RefreshCw, Wifi, X } from "lucide-react";
import { BACKUP_API } from "./connection-transport";
import {
  connectionReport,
  probeConnection,
  type ConnectionResult,
  type ConnectionTarget,
} from "./connection-check";
import { localDemo } from "./client";
import "./connection-check.css";
const config = import.meta.env;
const api = localDemo
  ? "http://127.0.0.1:8788"
  : config.VITE_API_BASE_URL?.replace(/\/$/, "");
const auth = localDemo
  ? "http://127.0.0.1:8788"
  : config.VITE_SUPABASE_URL?.replace(/\/$/, "");
const targets: ConnectionTarget[] = [
  {
    id: "site",
    name: "网站资源",
    url: `${location.origin}${config.BASE_URL}manifest.webmanifest?connection-check=1`,
  },
  {
    id: "auth",
    name: "登录服务",
    url: auth ? auth + "/auth/v1/health" : "",
    headers: { apikey: config.VITE_SUPABASE_PUBLISHABLE_KEY || "" },
  },
  { id: "api", name: "相册接口", url: api ? api + "/health" : "" },
  {
    id: "backup",
    name: "备用线路",
    url:
      (localDemo ? "http://127.0.0.1:8788/__backup" : BACKUP_API) + "/health",
  },
];
export default function ConnectionCheck() {
  const [results, setResults] = useState<ConnectionResult[]>([]),
    [busy, setBusy] = useState(true),
    [time, setTime] = useState(""),
    [copied, setCopied] = useState(false);
  const version = useRef(0);
  async function run() {
    const current = ++version.current;
    setBusy(true);
    setCopied(false);
    setResults([]);
    setTime(new Date().toISOString());
    await Promise.all(
      targets.map(async (target) => {
        const result = await probeConnection(target);
        if (version.current === current) setResults((old) => [...old, result]);
      }),
    );
    if (version.current === current) setBusy(false);
  }
  useEffect(() => {
    void run();
    return () => {
      version.current++;
    };
  }, []);
  const ordered = targets
    .map((target) => results.find((result) => result.id === target.id))
    .filter((item): item is ConnectionResult => !!item);
  const report = connectionReport(ordered, time);
  return (
    <main className="connection-page">
      <a className="connection-back" href="#/featured">
        <ArrowLeft size={18} />
        返回登录
      </a>
      <section className="connection-panel">
        <Wifi size={28} />
        <h1>连接检查</h1>
        <p>检查网站、登录服务和相册接口的连接状态。</p>
        <ul aria-live="polite">
          {targets.map((target) => {
            const result = results.find((item) => item.id === target.id);
            return (
              <li
                key={target.id}
                data-state={!result ? "loading" : result.ok ? "ok" : "error"}
              >
                <div>
                  <strong>{target.name}</strong>
                  <span>{result?.text || "正在检查…"}</span>
                </div>
                {result ? (
                  result.ok ? (
                    <Check size={19} />
                  ) : (
                    <X size={19} />
                  )
                ) : (
                  <RefreshCw size={18} className="spin" />
                )}
              </li>
            );
          })}
        </ul>
        {!busy && (
          <p className="connection-hint">
            {results.every((item) => item.ok)
              ? "连接检查通过，可以返回登录后重试。"
              : "请复制检查结果，发给相册管理员继续排查。"}
          </p>
        )}
        <div className="connection-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run()}
          >
            <RefreshCw size={16} />
            重新检查
          </button>
          <button
            disabled={busy}
            onClick={() => {
              void navigator.clipboard
                .writeText(report)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy size={16} />
            {copied ? "已复制" : "复制结果"}
          </button>
        </div>
        {!busy && (
          <textarea aria-label="连接检查结果" readOnly value={report} />
        )}
      </section>
    </main>
  );
}
