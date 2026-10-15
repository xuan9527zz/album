import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";

export type AudioControls = {
  play: () => Promise<boolean>;
  pause: () => void;
  reset: () => void;
};
export const FileAudioPlayer = forwardRef<
  AudioControls,
  {
    source: string;
    title?: string;
    active?: boolean;
    standalone?: boolean;
    onRetry?: () => void;
    expiresAt?: string | null;
    onExpired?: () => void;
  }
>(function FileAudioPlayer(
  {
    source,
    title = "配乐",
    active = false,
    standalone = false,
    onRetry,
    expiresAt,
    onExpired,
  },
  ref,
) {
  const media = useRef<HTMLAudioElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false),
    attempt = useRef(0),
    buffered = useRef(0);
  const [muted, setMuted] = useState(false),
    [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const expired = useRef(false),
    expiryNotice = useRef(onExpired);
  expiryNotice.current = onExpired;
  useEffect(() => {
    expired.current = false;
    if (!expiresAt) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      if (expired.current) return;
      expired.current = true;
      pause();
      media.current?.removeAttribute("src");
      media.current?.load();
      setError("配乐已过期");
      expiryNotice.current?.();
    };
    const check = () => {
      clearTimeout(timer);
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) expire();
      else timer = setTimeout(expire, remaining);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiresAt]);
  const clear = () => {
    clearTimeout(timeout.current);
    pending.current = false;
    setLoading(false);
  };
  function pause() {
    attempt.current++;
    media.current?.pause();
    clear();
    setPlaying(false);
  }
  function arm() {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (pending.current) {
        media.current?.pause();
        clear();
        setError("配乐加载超时");
      }
    }, 45000);
  }
  async function play() {
    const audio = media.current;
    if (!audio) return false;
    if (expired.current) {
      setError("配乐已过期");
      return false;
    }
    if (audio.muted) return true;
    const current = ++attempt.current;
    setError("");
    pending.current = true;
    setLoading(audio.readyState < 3);
    arm();
    try {
      if (audio.error || error) audio.load();
      await audio.play();
      if (current !== attempt.current) return false;
      clear();
      setPlaying(true);
      return true;
    } catch (failure) {
      if (current !== attempt.current) return false;
      clear();
      if ((failure as Error).name !== "AbortError")
        setError("配乐暂时无法播放");
      return false;
    }
  }
  useImperativeHandle(ref, () => ({
    play,
    pause,
    reset() {
      pause();
      if (media.current?.readyState) media.current.currentTime = 0;
    },
  }));
  useEffect(() => {
    const audio = media.current;
    return () => {
      attempt.current++;
      clearTimeout(timeout.current);
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, [source]);
  return (
    <section className="album-audio" aria-label="影集配乐">
      {standalone && (
        <button
          type="button"
          aria-label={playing ? "暂停配乐" : "试听配乐"}
          onClick={() => (playing ? pause() : void play())}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
      )}
      <span className="album-audio-title" title={title}>
        <Music2 size={15} />
        <span>{title}</span>
      </span>
      {loading && (
        <LoaderCircle
          className="audio-spinner"
          size={16}
          aria-label="音乐缓冲中"
        />
      )}
      <button
        type="button"
        aria-label={muted ? "开启声音" : "静音"}
        aria-pressed={muted}
        onClick={() => {
          const next = !muted;
          if (next && pending.current) pause();
          setMuted(next);
          if (media.current) media.current.muted = next;
          if (!next && (active || playing)) void play();
        }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      {error && (
        <span className="album-audio-error" role="alert">
          {error}
          {!expired.current && (
            <button
              type="button"
              aria-label="重试配乐"
              onClick={() => (active || !onRetry ? void play() : onRetry())}
            >
              <RefreshCw size={15} />
            </button>
          )}
        </span>
      )}
      <audio
        ref={media}
        src={expired.current ? undefined : source}
        preload="auto"
        loop
        muted={muted}
        onPlaying={() => {
          if (expired.current) {
            media.current?.pause();
            return;
          }
          clear();
          setPlaying(true);
          setError("");
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => {
          if (media.current && !media.current.paused) {
            if (!pending.current) {
              pending.current = true;
              arm();
            }
            setLoading(true);
          }
        }}
        onProgress={() => {
          const audio = media.current;
          const end = audio?.buffered.length
            ? audio.buffered.end(audio.buffered.length - 1)
            : 0;
          if (end > buffered.current) {
            buffered.current = end;
            if (pending.current) arm();
          }
        }}
        onError={() => {
          if (expired.current) return;
          clear();
          setError("配乐暂时无法播放");
        }}
      />
    </section>
  );
});
