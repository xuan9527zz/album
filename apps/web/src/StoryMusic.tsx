import { useEffect, useRef, useState } from "react";
import { ExternalLink, Music2, RefreshCw, X, ChevronDown } from "lucide-react";
import {
  audioTrack,
  audioTracks,
} from "../../../packages/zine/src/audio-tracks";
import { FileAudioPlayer } from "./FileAudioPlayer";
import { Client, apiBase } from "./client";
import {
  musicEmbed,
  musicProviderName,
  musicSource,
  parseMusicUrl,
  type MusicInput,
  type MusicConfig,
} from "../../../packages/zine/src/music";

export type MusicDraft = {
  url: string;
  enabled: boolean;
  title: string;
  artist: string;
  expiresAt?: string | null;
};
export const emptyMusic: MusicDraft = {
  url: "",
  enabled: false,
  title: "",
  artist: "",
};
export function musicFromDraft(draft: MusicDraft): MusicInput | null {
  if (!draft.url.trim()) {
    if (draft.enabled) throw new Error("请先粘贴歌曲链接，再启用背景音乐");
    return null;
  }
  const parsed = parseMusicUrl(draft.url);
  if (!parsed.ok) throw new Error(parsed.message);
  return {
    provider: parsed.provider,
    provider_track_id: parsed.provider_track_id,
    enabled: draft.enabled,
    title: draft.title.trim() || null,
    artist: draft.artist.trim() || null,
    schema_version: 1,
  };
}
export function MusicSettings({
  draft,
  onChange,
  client,
}: {
  draft: MusicDraft;
  onChange: (draft: MusicDraft) => void;
  client: Client;
}) {
  const parsed = draft.url.trim() ? parseMusicUrl(draft.url) : null;
  const [custom, setCustom] = useState(false);
  type Uploaded = {
    id: string;
    title: string;
    expires_at: string;
    expired: boolean;
    size_bytes: number;
  };
  const [files, setFiles] = useState<Uploaded[]>([]),
    [configured, setConfigured] = useState(false);
  const [uploading, setUploading] = useState(false),
    [percent, setPercent] = useState(0),
    [status, setStatus] = useState(""),
    [uploadError, setUploadError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    uploadController = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    void client
      .request<{ files: Uploaded[]; configured: boolean }>("/v1/music")
      .then((result) => {
        if (live) {
          setFiles(result.files);
          setConfigured(result.configured);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      uploadController.current?.abort();
    };
  }, [client]);
  useEffect(() => {
    if (status !== "已添加") return;
    const timer = setTimeout(() => setStatus(""), 2500);
    return () => clearTimeout(timer);
  }, [status]);
  async function upload(file?: File) {
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith(".mp3") ||
      file.size > 20 * 1024 ** 2
    ) {
      setUploadError("请选择不超过 20 MB 的 MP3");
      return;
    }
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setPercent(0);
    setStatus("正在上传");
    setUploadError("");
    try {
      const track = await client.uploadMusic(
        file,
        setPercent,
        () => setStatus("正在保存"),
        controller.signal,
      );
      setFiles((old) => [track, ...old]);
      setCustom(false);
      onChange({
        url: musicSource("file", track.id),
        enabled: true,
        title: track.title,
        artist: "",
        expiresAt: track.expires_at,
      });
      setStatus("已添加");
    } catch (error) {
      if (!controller.signal.aborted) setUploadError((error as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  const uploaded =
    parsed?.ok &&
    parsed.provider === "file" &&
    !audioTrack(parsed.provider_track_id);
  const expires =
    draft.expiresAt ||
    (parsed?.ok
      ? files.find((f) => f.id === parsed.provider_track_id)?.expires_at
      : undefined);
  const expired = !!expires && new Date(expires).getTime() <= Date.now();
  useEffect(() => {
    if (draft.url && (!parsed?.ok || parsed.provider !== "file"))
      setCustom(true);
  }, [draft.url]);
  const preview = parsed?.ok
    ? {
        ...musicFromDraft({ ...draft, enabled: true })!,
        source_url: parsed.source_url,
      }
    : null;
  return (
    <section className="story-panel music-settings">
      <div className="story-section-heading">
        <span>05</span>
        <h2>背景音乐</h2>
      </div>
      <label>
        配乐
        <select
          aria-label="配乐"
          value={
            parsed?.ok && parsed.provider === "file"
              ? parsed.provider_track_id
              : custom
                ? "link"
                : ""
          }
          onChange={(event) => {
            const track = audioTrack(event.target.value);
            const imported = files.find((f) => f.id === event.target.value);
            setCustom(event.target.value === "link");
            onChange(
              track
                ? {
                    url: track.url,
                    enabled: true,
                    title: track.title,
                    artist: track.artist,
                  }
                : imported
                  ? {
                      url: musicSource("file", imported.id),
                      enabled: !imported.expired,
                      title: imported.title,
                      artist: "",
                      expiresAt: imported.expires_at,
                    }
                  : { ...emptyMusic },
            );
          }}
        >
          <option value="">不使用配乐</option>
          {audioTracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.title} · {track.artist}
            </option>
          ))}
          {files
            .filter(
              (f) =>
                !f.expired || (parsed?.ok && parsed.provider_track_id === f.id),
            )
            .map((f) => (
              <option key={f.id} value={f.id} disabled={f.expired}>
                {f.title}
                {f.expired ? " · 已过期" : ""}
              </option>
            ))}
          {uploaded &&
            parsed?.ok &&
            !files.some((f) => f.id === parsed.provider_track_id) && (
              <option value={parsed.provider_track_id}>
                {draft.title || "上传的配乐"}
                {expired ? " · 已过期" : ""}
              </option>
            )}
          <option value="link">粘贴歌曲链接</option>
        </select>
      </label>
      {custom && (
        <label>
          歌曲链接
          <input
            aria-label="歌曲链接"
            type="url"
            maxLength={2048}
            value={draft.url}
            onChange={(e) => onChange({ ...draft, url: e.target.value })}
            placeholder="粘贴网易云或 QQ 音乐完整单曲链接"
          />
        </label>
      )}
      {parsed && !parsed.ok && (
        <p className="story-error" role="alert">
          {parsed.message}
        </p>
      )}
      {(custom || uploaded) && (
        <div className="music-text-fields">
          <label>
            曲名（可选）
            <input
              aria-label="曲名"
              maxLength={100}
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            歌手（可选）
            <input
              aria-label="歌手"
              maxLength={100}
              value={draft.artist}
              onChange={(e) => onChange({ ...draft, artist: e.target.value })}
            />
          </label>
        </div>
      )}
      <label className="music-enable">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={expired || uploading}
          onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
        />
        启用影集背景音乐
      </label>
      <div className="music-upload">
        <input
          ref={input}
          type="file"
          accept=".mp3,audio/mpeg"
          hidden
          aria-label="上传 MP3 文件"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <button
          type="button"
          disabled={uploading || !configured}
          onClick={() => input.current?.click()}
        >
          上传 MP3
        </button>
        <small>最多 20 MB · 保存 72 小时</small>
        {(uploading || status === "已添加") && (
          <div role="status">
            <span>
              {status}
              {status === "正在上传"
                ? ` ${percent}%`
                : status === "已添加"
                  ? " 100%"
                  : "…"}
            </span>
            <progress aria-label="MP3 上传进度" max={100} value={percent} />
          </div>
        )}
        {expires && (
          <small>
            {expired
              ? "已过期，请重新上传"
              : `有效至 ${new Date(expires).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
          </small>
        )}
        {uploadError && (
          <p role="alert" className="story-error">
            {uploadError}
          </p>
        )}
      </div>
      <div className="music-settings-actions">
        {preview?.provider === "file" && (
          <FileAudioPlayer
            key={preview.provider_track_id}
            source={
              audioTrack(preview.provider_track_id)
                ? `${import.meta.env.BASE_URL}music/${preview.provider_track_id}.mp3`
                : `${apiBase()}/v1/music/${preview.provider_track_id}/stream`
            }
            title={preview.title || "配乐"}
            expiresAt={expires}
            standalone
          />
        )}
        {preview && preview.provider !== "file" && (
          <MusicHost
            key={`${preview.provider}/${preview.provider_track_id}`}
            music={preview}
            storyID="editor-preview"
            buttonLabel="预览播放器"
          />
        )}
        {draft.url && (
          <button type="button" onClick={() => onChange({ ...emptyMusic })}>
            移除歌曲
          </button>
        )}
      </div>
      {parsed?.ok && parsed.provider !== "file" && (
        <p className="zine-help">
          平台歌曲需要在官方播放器中单独点播放；文件配乐可随影集一起播放。
        </p>
      )}
    </section>
  );
}
export function MusicHost({
  music,
  storyID,
  buttonLabel = "开启音乐",
}: {
  music: MusicConfig | null | undefined;
  storyID: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const [nonce, setNonce] = useState(0),
    [status, setStatus] = useState("loading"),
    [help, setHelp] = useState(false);
  const [openedIdentity, setOpenedIdentity] = useState("");
  const identity = music
    ? `${storyID}/${music.provider}/${music.provider_track_id}`
    : "";
  useEffect(() => {
    setOpen(false);
    setCollapsed(false);
    setNonce(0);
    setHelp(false);
  }, [identity, music?.enabled]);
  useEffect(() => {
    const leave = () => setOpen(false);
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, []);
  useEffect(() => {
    if (!open) return;
    setStatus("loading");
    const timer = window.setTimeout(
      () => setStatus((old) => (old === "loading" ? "slow" : old)),
      10000,
    );
    return () => window.clearTimeout(timer);
  }, [open, nonce]);
  if (!music?.enabled) return null;
  const source = musicSource(music.provider, music.provider_track_id);
  return (
    <div className="music-host">
      <button
        type="button"
        className="music-entry"
        aria-label={open ? "展开音乐面板" : buttonLabel}
        onClick={() => {
          setOpenedIdentity(identity);
          setOpen(true);
          setCollapsed(false);
        }}
      >
        <Music2 size={18} />
        <span>{open ? "音乐" : buttonLabel}</span>
      </button>
      {open && openedIdentity === identity && (
        <section
          className={`music-panel${collapsed ? " is-collapsed" : ""}`}
          aria-label="官方音乐播放器"
        >
          <header>
            <div>
              <strong>{music.title || "影集背景音乐"}</strong>
              <small>{music.artist || musicProviderName[music.provider]}</small>
            </div>
            <button
              type="button"
              aria-label="收起面板（音乐可能仍在播放）"
              onClick={() => setCollapsed(true)}
            >
              <ChevronDown size={17} />
            </button>
            <button
              type="button"
              aria-label="关闭音乐"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="music-panel-body" hidden={collapsed}>
            <iframe
              key={`${identity}/${nonce}`}
              src={musicEmbed(music)}
              title={`${musicProviderName[music.provider]}官方播放器`}
              width={music.provider === "qq" ? 320 : 298}
              height={music.provider === "qq" ? 85 : 70}
              referrerPolicy="no-referrer"
              onLoad={() => setStatus("loaded")}
            />
            <p>
              {status === "loading"
                ? "正在载入官方播放器…"
                : status === "slow"
                  ? "载入较慢，可继续阅读或在平台打开。"
                  : "请在播放器中点击播放。"}
            </p>
            <div className="music-panel-actions">
              <a href={source} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} />
                在平台打开
              </a>
              <button type="button" onClick={() => setHelp((value) => !value)}>
                无法播放？
              </button>
            </div>
            {help && (
              <div className="music-help">
                <p>
                  曲目可能仅可试听，或受会员、版权、地区、网络和浏览器限制。你可以在平台打开，也可以关闭音乐继续阅读。
                </p>
                <button
                  type="button"
                  onClick={() => setNonce((value) => value + 1)}
                >
                  <RefreshCw size={14} />
                  重新加载（可能从头播放）
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {open && collapsed && (
        <button
          className="music-stop-collapsed"
          type="button"
          onClick={() => setOpen(false)}
        >
          关闭音乐
        </button>
      )}
    </div>
  );
}
