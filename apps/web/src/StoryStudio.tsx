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
import { Client, localDemo } from "./client";
import { cachedImage, imageInSession } from "./session-image-cache";
import "./story.css";

type Template = "journal" | "cinema" | "postcard";
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
  journal: "旅行手记",
  cinema: "黑色影院",
  postcard: "明信片",
};
const transitionNames: Record<Transition, string> = {
  slide: "横向切换",
  fade: "柔和淡入",
  zoom: "缓慢推近",
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
  const asset = full
    ? assetFor(photo, true)
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
  const [template, setTemplate] = useState<Template>("journal");
  const [transition, setTransition] = useState<Transition>("slide");
  const [shared, setShared] = useState(false);
  const [selected, setSelected] = useState<Photo[]>([]);
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
      .then((story) => {
        if (!active) return;
        if (!story.is_owner) throw new Error("只有影集主人可以编辑");
        setTitle(story.title);
        setTemplate(story.template);
        setTransition(story.transition);
        setShared(story.is_shared);
        setSelected(story.photos);
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
      const story = await client.request<Story>(
        storyID ? `/v1/stories/${storyID}` : "/v1/stories",
        {
          title: title.trim(),
          template,
          transition,
          is_shared: shared,
          photo_ids: selected.map((photo) => photo.id),
        },
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
          <p>照片的顺序、画面和节奏，都由你决定。</p>
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
      <div className="story-workspace">
        <div className="story-work-main">
          <section className="story-panel">
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
          <section className="story-panel">
            <div className="story-section-heading">
              <span>02</span>
              <h2>安排顺序</h2>
              <small>用箭头调整播放顺序</small>
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
        </div>
        <aside className="story-work-side">
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
                placeholder="例如：东京旅行"
              />
            </label>
            <p className="story-control-label">画面模板</p>
            <div className="story-template-options">
              {(["journal", "cinema", "postcard"] as Template[]).map(
                (option) => (
                  <button
                    key={option}
                    type="button"
                    className={`story-template-choice story-template-${option}${template === option ? " active" : ""}`}
                    aria-pressed={template === option}
                    onClick={() => setTemplate(option)}
                  >
                    <span className="story-template-mini" />
                    {templateNames[option]}
                  </button>
                ),
              )}
            </div>
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
          <div className={`story-editor-preview story-template-${template}`}>
            <span>PREVIEW / {String(selected.length).padStart(2, "0")}</span>
            {selected[0] && <StoryImage photo={selected[0]} urls={urls} />}
            <strong>{title || "你的影集"}</strong>
            <small>
              {templateNames[template]} · {transitionNames[transition]}
            </small>
          </div>
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

function StoryPlayer({ client, storyID }: { client: Client; storyID: string }) {
  const [story, setStory] = useState<StoryResult | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState<"next" | "previous">("next");
  const [error, setError] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let live = true;
    client
      .request<StoryResult>(`/v1/stories/${storyID}`)
      .then((result) => {
        if (live) setStory(result);
      })
      .catch((error) => {
        if (live) setError(showError(error));
      });
    return () => {
      live = false;
    };
  }, [client, storyID]);
  const photos = story?.photos || [];
  const urls = useMemo(
    () =>
      Object.fromEntries(
        (story?.urls || []).map((item) => [item.id, item.url]),
      ),
    [story],
  );
  const current = photos[index];
  function go(next: number) {
    if (next < 0 || next >= photos.length || next === index) return;
    setDirection(next > index ? "next" : "previous");
    setIndex(next);
    if (next === photos.length - 1) setPlaying(false);
  }
  useEffect(() => {
    if (!playing || photos.length < 2) return;
    const timer = window.setTimeout(() => go(index + 1), 5000);
    return () => window.clearTimeout(timer);
  }, [playing, index, photos.length]);
  useEffect(() => {
    const next = photos[index + 1];
    const asset = next && assetFor(next, true);
    if (asset && urls[asset.id] && !cachedImage(asset.id) && !localDemo)
      void imageInSession(asset.id, urls[asset.id]).catch(() => {});
  }, [index, story]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "Escape") location.hash = "/stories";
      if (
        event.code === "Space" &&
        !["INPUT", "BUTTON"].includes((event.target as HTMLElement).tagName)
      ) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, photos.length]);
  if (error)
    return (
      <div className="story-player-error">
        <p role="alert">{error}</p>
        <a href="#/stories">返回影集</a>
      </div>
    );
  if (!story)
    return (
      <p className="story-loading">
        <RefreshCw size={18} className="spin" />
        正在放映…
      </p>
    );
  return (
    <div
      className={`story-player story-template-${story.template}`}
      role="region"
      aria-label={`影集 ${story.title}`}
    >
      <header className="story-player-header">
        <a href="#/stories" aria-label="关闭影集">
          <X size={25} />
        </a>
        <span>
          唯味相册 <i /> {story.title}
        </span>
        <div>
          {story.is_owner && (
            <a href={`#/stories/${story.id}/edit`}>编辑影集</a>
          )}
          <span>
            {photos.length ? `${index + 1} / ${photos.length}` : "0 / 0"}
          </span>
        </div>
      </header>
      {!current ? (
        <div className="story-player-empty">
          <Images size={45} />
          <h2>这本影集暂时没有可看的照片</h2>
          <p>照片被删除或移出共享后，就不会在这里显示。</p>
        </div>
      ) : (
        <>
          <div
            className="story-player-stage"
            onTouchStart={(event) => {
              touchStart.current = {
                x: event.changedTouches[0].clientX,
                y: event.changedTouches[0].clientY,
              };
            }}
            onTouchEnd={(event) => {
              if (!touchStart.current) return;
              const dx = event.changedTouches[0].clientX - touchStart.current.x;
              const dy = event.changedTouches[0].clientY - touchStart.current.y;
              touchStart.current = null;
              if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3)
                go(index + (dx < 0 ? 1 : -1));
            }}
          >
            <div className="story-player-meta">
              <span className="story-frame-label">
                {templateNames[story.template]} /{" "}
                {String(index + 1).padStart(2, "0")}
              </span>
              <h1>
                {index === 0 ? story.title : current.title || story.title}
              </h1>
              <span className="story-meta-rule" />
              {current.location_label && <p>{current.location_label}</p>}
              {current.captured_local && (
                <small>
                  {current.captured_local.slice(0, 10).replaceAll("-", ".")}
                </small>
              )}
            </div>
            <div className="story-player-frame">
              <div
                key={`${current.id}-${index}`}
                className={`story-player-image story-motion-${story.transition} story-direction-${direction}`}
              >
                <StoryImage photo={current} urls={urls} full eager />
              </div>
            </div>
            <button
              type="button"
              className="story-player-arrow previous"
              aria-label="上一张"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              className="story-player-arrow next"
              aria-label="下一张"
              disabled={index === photos.length - 1}
              onClick={() => go(index + 1)}
            >
              <ChevronRight size={26} />
            </button>
          </div>
          <footer className="story-player-footer">
            <div className="story-player-controls">
              <button
                type="button"
                onClick={() => {
                  if (index === photos.length - 1) setIndex(0);
                  setPlaying((value) => !value);
                }}
                aria-label={playing ? "暂停放映" : "自动放映"}
              >
                {playing ? <Pause size={19} /> : <Play size={19} />}
                <span>{playing ? "暂停" : "自动放映"}</span>
              </button>
              <span>左右滑动或使用方向键切换</span>
            </div>
            <div className="story-progress" aria-label="影集进度">
              {photos.map((photo, photoIndex) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`第 ${photoIndex + 1} 张`}
                  aria-current={photoIndex === index ? "step" : undefined}
                  className={photoIndex <= index ? "seen" : ""}
                  onClick={() => go(photoIndex)}
                />
              ))}
            </div>
            <span className="story-player-count">
              {String(index + 1).padStart(2, "0")} /{" "}
              {String(photos.length).padStart(2, "0")}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}
