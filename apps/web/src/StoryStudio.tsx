import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Images,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import type { Photo } from "../../../packages/shared/src/index";
import { Client, localDemo, publicRequest, RequestError } from "./client";
import { cachedImage, imageInSession } from "./session-image-cache";
import {
  getZineCollection,
  isZineTemplate,
  syncZineConfig,
  newZineConfig,
} from "../../../packages/zine/src/model";
import type {
  ZineConfig,
  ZineTemplate,
} from "../../../packages/zine/src/types";
import { storyBodySchema } from "../../../packages/zine/src/schema";
import { ZineEditor, ZinePlayer } from "./ZineStudio";
import { ZineSpread } from "../../../packages/zine/src";
import { normalizeColor } from "../../../packages/zine/src/color";
import type { MusicConfig } from "../../../packages/zine/src/music";
import {
  MusicHost,
  MusicSettings,
  emptyMusic,
  musicFromDraft,
  type MusicDraft,
} from "./StoryMusic";
import { StoryExport } from "./StoryExport";
import { FileAudioPlayer } from "./FileAudioPlayer";
import "./story-tools.css";
import "./story.css";

type Template = "journal" | "cinema" | "postcard" | ZineTemplate;
type Transition = "slide" | "fade" | "zoom";
type Story = {
  id: string;
  title: string;
  template: Template;
  transition: Transition;
  is_shared: boolean;
  is_owner: boolean;
  owner_name: string;
  photo_count?: number;
  cover_photo?: Photo | null;
  photos?: Photo[];
  zine_config?: ZineConfig | null;
  music?: MusicConfig | null;
  updated_at: string;
};
type StoryResult = Story & {
  photos: Photo[];
  urls: { id: string; url: string }[];
};
type PhotoPage = {
  photos: Photo[];
  urls: { id: string; url: string }[];
  next_cursor: string | null;
};
const templateNames: Record<Template, string> = {
  journal: "余日 · 旧日游记",
  cinema: "途中 · 城市采样",
  postcard: "潮汐 · 海岸档案",
  "zine-city": "途中 · 城市采样",
  "zine-diary": "余日 · 旧日游记",
  "zine-coast": "潮汐 · 海岸档案",
};
const transitionNames: Record<Transition, string> = {
  slide: "横向切换",
  fade: "滑动与淡入",
  zoom: "滑动与推近",
};
const showError = (error: unknown) =>
  error instanceof Error ? error.message : "暂时无法完成操作";
const assetFor = (photo: Photo, full = false) =>
  (full && photo.assets.find((asset) => asset.role === "preview")) ||
  photo.assets.find((asset) => asset.role === "thumbnail") ||
  photo.assets.find((asset) => asset.role === "preview");

function StoryImage({
  photo,
  urls,
  full = false,
  eager = false,
}: {
  photo: Photo;
  urls: Record<string, string>;
  full?: boolean;
  eager?: boolean;
}) {
  const available = (role: string) =>
    photo.assets.find(
      (item) => item.role === role && (urls[item.id] || cachedImage(item.id)),
    );
  const asset = full
    ? available("preview") || available("thumbnail") || assetFor(photo, true)
    : photo.assets.find(
        (item) =>
          item.role === "thumbnail" && (urls[item.id] || cachedImage(item.id)),
      ) ||
      photo.assets.find(
        (item) =>
          item.role === "preview" && (urls[item.id] || cachedImage(item.id)),
      ) ||
      assetFor(photo);
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!asset) return;
    let live = true;
    const existing = cachedImage(asset.id);
    if (existing) setSrc(existing);
    else if (localDemo) setSrc(urls[asset.id] || "");
    else if (urls[asset.id]) {
      setSrc("");
      void imageInSession(asset.id, urls[asset.id])
        .then((url) => {
          if (live) setSrc(url);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [asset?.id, urls[asset?.id || ""]]);
  return src ? (
    <img
      src={src}
      alt={photo.title || "影集照片"}
      loading={eager ? "eager" : "lazy"}
    />
  ) : (
    <span className="story-image-pending">
      <Images size={28} />
      {asset ? "正在加载" : "暂无预览"}
    </span>
  );
}

export function StoryArea({
  client,
  route,
}: {
  client: Client;
  route: string;
}) {
  const parts = route.split("/").filter(Boolean);
  if (parts[1] === "new") return <StoryEditor client={client} />;
  if (parts[1] && parts[2] === "edit")
    return <StoryEditor key={parts[1]} client={client} storyID={parts[1]} />;
  if (parts[1])
    return <StoryPlayer key={parts[1]} client={client} storyID={parts[1]} />;
  return <StoryList client={client} />;
}

function StoryList({ client }: { client: Client }) {
  const [stories, setStories] = useState<Story[]>([]);
  const [urls, setURLs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    client
      .request<{ stories: Story[]; urls: { id: string; url: string }[] }>(
        "/v1/stories",
      )
      .then((result) => {
        if (!active) return;
        setStories(result.stories);
        setURLs(
          Object.fromEntries(result.urls.map((item) => [item.id, item.url])),
        );
      })
      .catch((error) => {
        if (active) setError(showError(error));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [client]);
  return (
    <section className="story-list-page">
      <div className="story-page-heading">
        <div>
          <p className="story-kicker">STORY STUDIO</p>
          <h1>我的影集</h1>
          <p>选好照片，排成你想翻看的顺序。</p>
        </div>
        <a className="story-create-button" href="#/stories/new">
          <Plus size={17} />
          制作影集
        </a>
      </div>
      {error && (
        <p className="story-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="story-loading">
          <RefreshCw size={17} className="spin" />
          正在打开影集…
        </p>
      )}
      {!busy && !error && !stories.length && (
        <div className="story-empty">
          <Film size={46} />
          <h2>还没有影集</h2>
          <p>从相册选至少两张照片，做一本可以翻阅的影集。</p>
          <a className="story-create-button" href="#/stories/new">
            开始制作 <ArrowRight size={16} />
          </a>
        </div>
      )}
      <div className="story-card-grid">
        {stories.map((story) => (
          <a
            key={story.id}
            href={`#/stories/${story.id}`}
            className={`story-card story-template-${story.template}`}
          >
            <div className="story-card-cover">
              {story.cover_photo && (
                <StoryImage photo={story.cover_photo} urls={urls} />
              )}
              <span className="story-card-number">
                {story.photo_count || 0} 张照片
              </span>
            </div>
            <div className="story-card-copy">
              <span>
                {story.is_shared ? "家庭共享" : "仅自己可见"} ·{" "}
                {templateNames[story.template]}
              </span>
              <h2>{story.title}</h2>
              <small>
                {story.is_owner ? "我的作品" : story.owner_name} ·{" "}
                {new Date(story.updated_at).toLocaleDateString("zh-CN")}
              </small>
            </div>
            <ArrowRight size={20} className="story-card-arrow" />
          </a>
        ))}
      </div>
    </section>
  );
}

function StoryEditor({
  client,
  storyID,
}: {
  client: Client;
  storyID?: string;
}) {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<ZineTemplate>("zine-city");
  const [transition, setTransition] = useState<Transition>("slide");
  const [shared, setShared] = useState(false);
  const [selected, setSelected] = useState<Photo[]>([]);
  const [zineConfig, setZineConfig] = useState<ZineConfig | null>(null);
  const [musicDraft, setMusicDraft] = useState<MusicDraft>({ ...emptyMusic });
  const [backgroundDraft, setBackgroundDraft] = useState(
    getZineCollection("zine-city").paper,
  );
  const [panel, setPanel] = useState<"photos" | "design" | "music">("photos");
  const themeDrafts = useRef(new Map<ZineTemplate, ZineConfig>());
  const [source, setSource] = useState<"mine" | "shared">("mine");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setURLs] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!storyID);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const query = useRef(0);
  useEffect(() => {
    if (!storyID) return;
    let active = true;
    client
      .request<StoryResult>(`/v1/stories/${storyID}`)
      .then((raw) => {
        const story = normalizedStory(raw);
        if (!active) return;
        if (!story.is_owner) throw new Error("只有影集主人可以编辑");
        setTitle(story.title);
        setTemplate(story.template);
        setTransition(story.transition);
        setShared(story.is_shared);
        setSelected(story.photos);
        setZineConfig(story.zine_config || null);
        setBackgroundDraft(
          story.zine_config.background_color ||
            getZineCollection(story.template).paper,
        );
        if (story.music)
          setMusicDraft({
            url: story.music.source_url,
            enabled: story.music.enabled,
            title: story.music.title || "",
            artist: story.music.artist || "",
          });
        setURLs((old) => ({
          ...old,
          ...Object.fromEntries(story.urls.map((item) => [item.id, item.url])),
        }));
      })
      .catch((error) => {
        if (active) setError(showError(error));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [client, storyID]);
  async function loadPhotos(next?: string, from: "mine" | "shared" = source) {
    const version = ++query.current;
    setLoading(true);
    try {
      const response = await client.request<PhotoPage>(
        `/v1/photos?${new URLSearchParams({
          shared: String(from === "shared"),
          featured: "false",
          ...(next ? { cursor: next } : {}),
        })}`,
      );
      if (version !== query.current) return;
      setPhotos((old) =>
        next
          ? [
              ...old,
              ...response.photos.filter(
                (item) => !old.some((p) => p.id === item.id),
              ),
            ]
          : response.photos,
      );
      setCursor(response.next_cursor);
      setURLs((old) => ({
        ...old,
        ...Object.fromEntries(response.urls.map((item) => [item.id, item.url])),
      }));
    } catch (error) {
      if (version === query.current) setError(showError(error));
    } finally {
      if (version === query.current) setLoading(false);
    }
  }
  useEffect(() => {
    setPhotos([]);
    setCursor(null);
    void loadPhotos(undefined, source);
    return () => {
      query.current++;
    };
  }, [source]);
  const selectedIDs = useMemo(
    () => new Set(selected.map((photo) => photo.id)),
    [selected],
  );
  const canShare =
    selected.length > 0 && selected.every((photo) => photo.is_shared);
  useEffect(() => {
    if (!canShare) setShared(false);
  }, [canShare]);
  useEffect(() => {
    if (!loaded || !isZineTemplate(template)) return;
    setZineConfig((old) => {
      const next = syncZineConfig(old, selected, template);
      return JSON.stringify(old) === JSON.stringify(next) ? old : next;
    });
  }, [template, selected, loaded]);
  useEffect(() => {
    if (!isZineTemplate(template)) return;
    const ids = selected
      .map(
        (photo) => photo.assets.find((asset) => asset.role === "preview")?.id,
      )
      .filter((id): id is string => !!id && !urls[id] && !cachedImage(id));
    if (!ids.length) return;
    let active = true;
    void (async () => {
      for (let start = 0; start < ids.length && active; start += 24) {
        const result = await client.request<{
          urls: { id: string; url: string }[];
        }>("/v1/assets/read-urls", { ids: ids.slice(start, start + 24) });
        if (active)
          setURLs((old) => ({
            ...old,
            ...Object.fromEntries(
              result.urls.map((item) => [item.id, item.url]),
            ),
          }));
      }
    })().catch((error) => {
      if (active) setError(showError(error));
    });
    return () => {
      active = false;
    };
  }, [template, selected, client]);
  function toggle(photo: Photo) {
    setSelected((old) =>
      old.some((item) => item.id === photo.id)
        ? old.filter((item) => item.id !== photo.id)
        : old.length >= 60
          ? old
          : [...old, photo],
    );
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    setSelected((old) => {
      const copy = [...old];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }
  async function save() {
    if (!title.trim()) {
      setError("请给影集起一个名字");
      return;
    }
    if (selected.length < 2) {
      setError("至少选择两张照片");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        template,
        transition,
        is_shared: shared,
        photo_ids: selected.map((photo) => photo.id),
        zine_config: zineConfig
          ? {
              ...zineConfig,
              background_color:
                normalizeColor(backgroundDraft) || backgroundDraft,
            }
          : null,
        music: musicFromDraft(musicDraft),
      };
      const validated = storyBodySchema.safeParse(payload);
      if (!validated.success)
        throw new Error(validated.error.issues[0].message);
      const story = await client.request<Story>(
        storyID ? `/v1/stories/${storyID}` : "/v1/stories",
        validated.data,
        storyID ? "PATCH" : "POST",
      );
      location.hash = `/stories/${story.id}`;
    } catch (error) {
      setError(showError(error));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!storyID) return;
    setSaving(true);
    setError("");
    try {
      await client.request(`/v1/stories/${storyID}`, undefined, "DELETE");
      location.hash = "/stories";
    } catch (error) {
      setError(showError(error));
      setSaving(false);
    }
  }
  if (!loaded)
    return (
      <p className="story-loading">
        <RefreshCw size={18} className="spin" />
        正在打开工作台…
      </p>
    );
  return (
    <section className="story-editor-page">
      <div className="story-editor-top">
        <a href={storyID ? `#/stories/${storyID}` : "#/stories"}>
          <ArrowLeft size={18} />
          返回影集
        </a>
        <span>影集工作台 · {selected.length}/60 张</span>
      </div>
      <div className="story-editor-head">
        <div>
          <p className="story-kicker">CREATE YOUR STORY</p>
          <h1>{storyID ? "编辑影集" : "制作一本影集"}</h1>
          <p>选择照片、编排版面，保存后观看或导出。</p>
        </div>
        <button
          className="story-save"
          type="button"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "正在保存…" : storyID ? "保存修改" : "保存影集"}
          <ArrowRight size={17} />
        </button>
      </div>
      {error && (
        <p className="story-error" role="alert">
          {error}
        </p>
      )}
      <nav className="story-work-tabs" aria-label="影集工作台步骤">
        <button
          type="button"
          aria-pressed={panel === "photos"}
          onClick={() => setPanel("photos")}
        >
          01 选择照片 <small>{selected.length}</small>
        </button>
        <button
          type="button"
          aria-pressed={panel === "design"}
          onClick={() => setPanel("design")}
        >
          02 编排版面
        </button>
        <button
          type="button"
          aria-pressed={panel === "music"}
          onClick={() => setPanel("music")}
        >
          03 背景音乐
        </button>
        {storyID && (
          <a href={`#/stories/${storyID}`}>
            观看与导出 <ArrowRight size={15} />
          </a>
        )}
      </nav>
      <div className="story-workspace">
        <div className="story-work-main">
          <section className="story-panel" hidden={panel !== "photos"}>
            <div className="story-section-heading">
              <span>01</span>
              <h2>挑选照片</h2>
              <small>点击加入或移出影集</small>
            </div>
            <div className="story-source-tabs">
              <button
                className={source === "mine" ? "active" : ""}
                onClick={() => setSource("mine")}
              >
                我的照片
              </button>
              <button
                className={source === "shared" ? "active" : ""}
                onClick={() => setSource("shared")}
              >
                共享照片
              </button>
            </div>
            <div className="story-picker-grid">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  className={`story-pick${selectedIDs.has(photo.id) ? " selected" : ""}`}
                  aria-label={`${selectedIDs.has(photo.id) ? "移出" : "选择"}照片 ${photo.title || "未命名"}`}
                  aria-pressed={selectedIDs.has(photo.id)}
                  onClick={() => toggle(photo)}
                >
                  <StoryImage photo={photo} urls={urls} />
                  <span className="story-pick-check">
                    {selectedIDs.has(photo.id) ? (
                      <Check size={15} />
                    ) : (
                      <Plus size={15} />
                    )}
                  </span>
                  <span className="story-pick-name">
                    {photo.title || "未命名照片"}
                  </span>
                </button>
              ))}
            </div>
            {!loading && !photos.length && (
              <p className="story-muted">这里还没有可选的照片。</p>
            )}
            {loading && (
              <p className="story-loading">
                <RefreshCw size={15} className="spin" />
                正在加载照片…
              </p>
            )}
            {cursor && (
              <button
                className="story-more"
                type="button"
                disabled={loading}
                onClick={() => void loadPhotos(cursor)}
              >
                加载更多照片
              </button>
            )}
          </section>
          <section className="story-panel" hidden={panel !== "photos"}>
            <div className="story-section-heading">
              <span>02</span>
              <h2>{isZineTemplate(template) ? "照片清单" : "安排顺序"}</h2>
              <small>
                {isZineTemplate(template)
                  ? "跨页顺序在下方的版面中调整"
                  : "用箭头调整播放顺序"}
              </small>
            </div>
            {!selected.length ? (
              <p className="story-muted">先选择照片，它们会出现在这里。</p>
            ) : (
              <div className="story-timeline">
                {selected.map((photo, index) => (
                  <div className="story-timeline-item" key={photo.id}>
                    <span className="story-timeline-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="story-timeline-image">
                      <StoryImage photo={photo} urls={urls} />
                    </div>
                    <div className="story-timeline-label">
                      <strong>{photo.title || "未命名照片"}</strong>
                      <small>
                        {photo.location_label ||
                          photo.captured_local?.slice(0, 10) ||
                          "照片"}
                      </small>
                    </div>
                    <button
                      type="button"
                      aria-label={`前移 ${photo.title || "照片"}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`后移 ${photo.title || "照片"}`}
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button
                      type="button"
                      aria-label={`移出 ${photo.title || "照片"}`}
                      onClick={() => toggle(photo)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          {panel === "design" && zineConfig && (
            <ZineEditor
              template={template}
              config={zineConfig}
              photos={selected}
              title={title}
              onChange={setZineConfig}
              renderPhoto={(photo) => {
                const sourcePhoto = selected.find((p) => p.id === photo.id);
                return sourcePhoto ? (
                  <StoryImage
                    key={sourcePhoto.id}
                    photo={sourcePhoto}
                    urls={urls}
                    full
                  />
                ) : null;
              }}
            />
          )}
          {panel === "music" && (
            <MusicSettings draft={musicDraft} onChange={setMusicDraft} />
          )}
        </div>
        <aside className="story-work-side" data-panel={panel}>
          <section className="story-panel">
            <div className="story-section-heading">
              <span>03</span>
              <h2>影集外观</h2>
            </div>
            <label className="story-title-label">
              影集名称
              <input
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="填写影集名称"
              />
            </label>
            <div className="story-appearance-options">
              <p className="story-control-label">画面模板</p>
              <div className="story-template-options">
                {(
                  ["zine-city", "zine-diary", "zine-coast"] as ZineTemplate[]
                ).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`story-template-choice story-template-${option}${template === option ? " active" : ""}`}
                    aria-pressed={template === option}
                    onClick={() => {
                      if (isZineTemplate(template) && zineConfig)
                        themeDrafts.current.set(template, zineConfig);
                      if (isZineTemplate(option))
                        setZineConfig(
                          syncZineConfig(
                            themeDrafts.current.get(option) || null,
                            selected,
                            option,
                          ),
                        );
                      setTemplate(option);
                      setBackgroundDraft(
                        themeDrafts.current.get(option)?.background_color ||
                          getZineCollection(option).paper,
                      );
                    }}
                  >
                    <span className="story-template-mini" />
                    {templateNames[option]}
                  </button>
                ))}
              </div>
              <label className="story-color-label">
                背景颜色
                <div>
                  <input
                    type="color"
                    aria-label="选择背景颜色"
                    value={
                      normalizeColor(backgroundDraft) ||
                      getZineCollection(template).paper
                    }
                    onChange={(e) => {
                      setBackgroundDraft(e.target.value);
                      setZineConfig((old) =>
                        old
                          ? {
                              ...old,
                              background_color: e.target.value.toUpperCase(),
                            }
                          : old,
                      );
                    }}
                  />
                  <input
                    aria-label="背景颜色代码"
                    maxLength={7}
                    value={backgroundDraft}
                    onChange={(e) => {
                      setBackgroundDraft(e.target.value);
                      const color = normalizeColor(e.target.value);
                      if (color)
                        setZineConfig((old) =>
                          old ? { ...old, background_color: color } : old,
                        );
                    }}
                    spellCheck={false}
                  />
                </div>
                {!normalizeColor(backgroundDraft) && (
                  <small>请输入 #RGB 或 #RRGGBB 颜色代码</small>
                )}
              </label>
              <p className="story-control-label">切换动画</p>
              <div className="story-transition-options">
                {(["slide", "fade", "zoom"] as Transition[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={transition === option}
                    className={transition === option ? "active" : ""}
                    onClick={() => setTransition(option)}
                  >
                    {transitionNames[option]}
                  </button>
                ))}
              </div>
            </div>
            <label className="story-share-label">
              <input
                type="checkbox"
                checked={shared}
                disabled={!canShare}
                onChange={(event) => setShared(event.target.checked)}
              />
              <span>
                <strong>与家人共享影集</strong>
                <small>
                  {canShare ? "所有家人都可以翻阅" : "先把所选照片放入共享相册"}
                </small>
              </span>
            </label>
          </section>
          {zineConfig?.pages[0] && (
            <div className="story-live-preview">
              <ZineSpread
                collection={getZineCollection(template)}
                page={zineConfig.pages[0]}
                photos={selected}
                title={title || "你的影集"}
                background={zineConfig.background_color}
                renderPhoto={(photo) => (
                  <StoryImage
                    photo={selected.find((p) => p.id === photo.id)!}
                    urls={urls}
                    full
                  />
                )}
              />
              <strong>{title || "你的影集"}</strong>
              <small>{templateNames[template]}</small>
            </div>
          )}
          {isZineTemplate(template) && (
            <p className="zine-help">
              {getZineCollection(template).fonts}
              <br />
              固定排版 · 自动照片资料 · 可填写短句
            </p>
          )}
          {storyID && (
            <div className="story-delete">
              {deleteConfirm ? (
                <>
                  <p>确定删除这本影集？原照片不会删除。</p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void remove()}
                  >
                    确认删除
                  </button>
                  <button type="button" onClick={() => setDeleteConfirm(false)}>
                    取消
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setDeleteConfirm(true)}>
                  <Trash2 size={16} />
                  删除影集
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      <div className="story-mobile-save">
        <button
          className="story-save"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "正在保存…" : storyID ? "保存修改" : "保存影集"}
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}

function normalizedStory(story: StoryResult) {
  const template = isZineTemplate(story.template)
    ? story.template
    : story.template === "cinema"
      ? "zine-city"
      : story.template === "postcard"
        ? "zine-coast"
        : "zine-diary";
  return {
    ...story,
    template,
    zine_config: story.zine_config || newZineConfig(story.photos, template),
  };
}
function StoryPlayer({ client, storyID }: { client: Client; storyID: string }) {
  return <StoryReader client={client} storyID={storyID} />;
}
export function PublicStoryReader({ token }: { token: string }) {
  return <StoryReader publicToken={token} />;
}
function StoryReader({
  client,
  storyID,
  publicToken,
}: {
  client?: Client;
  storyID?: string;
  publicToken?: string;
}) {
  const [story, setStory] = useState<ReturnType<typeof normalizedStory> | null>(
    null,
  );
  const lastGood = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function load() {
      try {
        const result = publicToken
          ? await publicRequest<StoryResult>(
              "/v1/public/stories/" + publicToken,
              controller.signal,
            )
          : await client!.request<StoryResult>("/v1/stories/" + storyID);
        if (live) {
          lastGood.current = true;
          setStory(normalizedStory(result));
          setError("");
        }
      } catch (e) {
        if (
          live &&
          (!lastGood.current ||
            (e instanceof RequestError && [401, 403, 404].includes(e.status)))
        )
          setError(showError(e));
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 240000);
    return () => {
      live = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [client, storyID, publicToken]);
  const urls = useMemo(
    () =>
      Object.fromEntries(
        (story?.urls || []).map((item) => [item.id, item.url]),
      ),
    [story],
  );
  if (error)
    return (
      <section className="story-reader-error">
        <h1>影集暂时无法打开</h1>
        <p role="alert">
          {publicToken ? "观看链接可能已关闭，或当前网络无法连接。" : error}
        </p>
        <a href="#/stories">返回相册</a>
      </section>
    );
  if (!story)
    return (
      <p className="story-loading">
        <RefreshCw size={18} className="spin" />
        正在打开影集…
      </p>
    );
  return (
    <ZinePlayer
      key={story.id}
      story={story}
      publicView={!!publicToken}
      toolbar={
        <>
          {import.meta.env.DEV && localDemo && new URLSearchParams(location.search).has("musicTrial") ? (
            <FileAudioPlayer source={`/__music-trial/audio${new URLSearchParams(location.search).get("musicTrial") === "stall" ? `?stall=${story.id}` : new URLSearchParams(location.search).get("musicTrial") === "invalid" ? "?invalid=1" : ""}`} />
          ) : <MusicHost storyID={story.id} music={story.music} />}
          {client && story.is_owner && (
            <StoryExport story={story} client={client} />
          )}
        </>
      }
      renderPhoto={(photo) => (
        <StoryImage
          photo={story.photos.find((p) => p.id === photo.id)!}
          urls={urls}
          full
          eager
        />
      )}
      prefetch={(ids) => {
        for (const id of ids) {
          const photo = story.photos.find((p) => p.id === id);
          const asset = photo && assetFor(photo, true);
          if (asset && urls[asset.id] && !cachedImage(asset.id))
            void imageInSession(asset.id, urls[asset.id]).catch(() => {});
        }
      }}
    />
  );
}
