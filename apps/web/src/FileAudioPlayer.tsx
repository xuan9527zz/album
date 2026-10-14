import { useEffect, useRef, useState } from "react";
import { ChevronDown, Music2, Pause, Play, RefreshCw, X } from "lucide-react";
import { formatBytes } from "../../../packages/shared/src";
import { downloadAudio } from "./prepared-audio";

export function FileAudioPlayer({
  source,
  title = "MP3 配乐试播",
  subtitle = "本机试播",
  expectedBytes,
}: {
  source: string;
  title?: string;
  subtitle?: string;
  expectedBytes?: number;
}) {
  const [enabled, setEnabled] = useState(true);
  return enabled ? (
    <AudioSession
      key={source}
      source={source}
      title={title}
      subtitle={subtitle}
      expectedBytes={expectedBytes}
      close={() => setEnabled(false)}
    />
  ) : (
    <button
      className="music-entry"
      aria-label="加载配乐"
      onClick={() => setEnabled(true)}
    >
      <Music2 size={18} />
      <span>加载配乐</span>
    </button>
  );
}

function AudioSession({
  source,
  title,
  close,
  subtitle,
  expectedBytes,
}: {
  source: string;
  title: string;
  close: () => void;
  subtitle: string;
  expectedBytes?: number;
}) {
  const media = useRef<HTMLAudioElement>(null);
  const [nonce, setNonce] = useState(0),
    [collapsed, setCollapsed] = useState(false);
  const [state, setState] = useState<
    "loading" | "decoding" | "ready" | "error"
  >("loading");
  const [bytes, setBytes] = useState({ loaded: 0, total: 0 });
  const [url, setURL] = useState(""),
    [error, setError] = useState("");
  const [direct, setDirect] = useState(false);
  const [playing, setPlaying] = useState(false),
    [position, setPosition] = useState(0),
    [duration, setDuration] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let owned = "",
      alive = true;
    setState("loading");
    setURL("");
    setError("");
    setBytes({ loaded: 0, total: 0 });
    setPlaying(false);
    setDirect(false);
    setPosition(0);
    setDuration(0);
    void downloadAudio(
      source,
      controller.signal,
      (value) => {
        if (alive) setBytes(value);
      },
      expectedBytes,
    )
      .then((blob) => {
        if (!alive) return;
        owned = URL.createObjectURL(blob);
        setURL(owned);
        setState("decoding");
      })
      .catch((failure) => {
        if (alive) {
          setError((failure as Error).message);
          setState("error");
        }
      });
    const element = media.current;
    return () => {
      alive = false;
      controller.abort();
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [source, nonce, expectedBytes]);
  useEffect(() => {
    if (state !== "decoding") return;
    const timer = window.setTimeout(() => {
      setState("error");
      setError("音乐无法准备播放，请重试或静音观看");
    }, 15000);
    return () => window.clearTimeout(timer);
  }, [state]);
  const percent =
    state === "ready"
      ? direct
        ? null
        : 100
      : bytes.total
        ? Math.min(99, Math.floor((bytes.loaded / bytes.total) * 100))
        : null;
  const clock = (value: number) =>
    `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  async function toggle() {
    const element = media.current;
    if (!element || state !== "ready") return;
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      await element.play();
      setError("");
    } catch {
      setError("请点击播放配乐；如果仍无声音，可以静音观看。");
    }
  }
  function playDirectly() {
    setDirect(true);
    setError("");
    setState("decoding");
    setURL(new URL(source, location.href).href);
  }
  return (
    <div className="music-host file-audio-host">
      <button
        className="music-entry"
        aria-label="打开配乐面板"
        onClick={() => setCollapsed(false)}
      >
        <Music2 size={18} />
        <span>
          {state === "ready"
            ? "配乐"
            : percent === null
              ? "准备音乐"
              : `${percent}%`}
        </span>
      </button>
      <section
        className={`music-panel file-audio-panel${collapsed ? " is-collapsed" : ""}`}
        aria-label="文件音乐播放器"
      >
        <header>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
          <button
            aria-label={collapsed ? "展开配乐面板" : "收起配乐面板"}
            onClick={() => setCollapsed((old) => !old)}
          >
            <ChevronDown size={17} />
          </button>
          <button aria-label="关闭配乐" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div className="music-panel-body" hidden={collapsed}>
          <div className="file-audio-progress">
            <strong role="status">
              {state === "error"
                ? "音乐暂时未能准备好"
                : state === "ready"
                  ? direct
                    ? "在线播放已就绪"
                    : "100% · 音乐准备完成"
                  : state === "decoding"
                    ? "正在准备播放…"
                    : `音乐准备中${percent === null ? "…" : ` · ${percent}%`}`}
            </strong>
            {state !== "error" && !direct && (
              <progress
                aria-label="音乐加载进度"
                max={100}
                value={percent ?? undefined}
              />
            )}
            <small>
              {formatBytes(bytes.loaded)}
              {bytes.total > 0 && ` / ${formatBytes(bytes.total)}`}
            </small>
          </div>
          {direct && <p>兼容播放模式，音乐由浏览器缓冲。</p>}
          {state === "ready" && (
            <>
              <button
                className="file-audio-play"
                aria-label={playing ? "暂停配乐" : "播放配乐"}
                onClick={() => void toggle()}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}{" "}
                {playing ? "暂停配乐" : "播放配乐"}
              </button>
              <div className="file-audio-time">
                <span>{clock(position)}</span>
                <span>{clock(duration)}</span>
              </div>
              <input
                type="range"
                aria-label="配乐播放进度"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(position, duration || 1)}
                onChange={(event) => {
                  if (media.current)
                    media.current.currentTime = Number(event.target.value);
                  setPosition(Number(event.target.value));
                }}
              />
            </>
          )}
          {error && (
            <p className="story-error" role="alert">
              {error}
            </p>
          )}
          <div className="music-panel-actions">
            {state === "error" && (
              <button onClick={() => setNonce((old) => old + 1)}>
                <RefreshCw size={14} />
                重试音乐加载
              </button>
            )}
            {state === "error" && !direct && (
              <button onClick={playDirectly}>尝试兼容播放</button>
            )}
            <button onClick={close}>静音观看</button>
          </div>
        </div>
      </section>
      <audio
        ref={media}
        src={url || undefined}
        preload="auto"
        loop
        onCanPlay={(event) => {
          if (url && event.currentTarget.currentSrc === url) {
            setDuration(event.currentTarget.duration);
            setState("ready");
          }
        }}
        onError={(event) => {
          if (url && event.currentTarget.currentSrc === url) {
            setState("error");
            setError("音乐文件无法播放，请重试或换一个文件");
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
      />
    </div>
  );
}
