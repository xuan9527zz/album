import { useEffect, useState } from "react";
import { ExternalLink, Music2, RefreshCw, X, ChevronDown } from "lucide-react";
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
}: {
  draft: MusicDraft;
  onChange: (draft: MusicDraft) => void;
}) {
  const parsed = draft.url.trim() ? parseMusicUrl(draft.url) : null;
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
        <small>可选 · 官方播放器</small>
      </div>
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
      {parsed && (
        <p
          className={parsed.ok ? "music-recognized" : "story-error"}
          role={parsed.ok ? undefined : "alert"}
        >
          {parsed.ok
            ? `${musicProviderName[parsed.provider]} · 歌曲 ID ${parsed.provider_track_id}`
            : parsed.message}
        </p>
      )}
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
      <label className="music-enable">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
        />
        启用影集背景音乐
      </label>
      <div className="music-settings-actions">
        {preview && (
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
      <p className="zine-help">
        粘贴完整单曲链接。音乐由官方播放器提供，开启后需在播放器内点击播放；部分歌曲可能因会员、版权、地区或浏览器限制无法播放。
      </p>
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
