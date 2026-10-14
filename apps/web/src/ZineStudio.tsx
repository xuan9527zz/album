import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Plus,
  X,
} from "lucide-react";
import {
  getZineCollection,
  getZineLayout,
  newZineConfig,
  syncZineConfig,
  ZineSpread,
} from "../../../packages/zine/src";
import type {
  ZineConfig,
  ZinePage,
  ZinePhoto,
  ZineTemplate,
} from "../../../packages/zine/src";
import "./zine-studio.css";

function usePhone() {
  const [phone, setPhone] = useState(
    () => window.matchMedia("(max-width: 680px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)");
    const update = () => setPhone(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
export function ZineEditor({
  template,
  config,
  photos,
  title,
  onChange,
  renderPhoto,
}: {
  template: ZineTemplate;
  config: ZineConfig;
  photos: readonly ZinePhoto[];
  title: string;
  onChange: (config: ZineConfig) => void;
  renderPhoto: (photo: ZinePhoto) => ReactNode;
}) {
  const collection = getZineCollection(template);
  const [selectedPage, setSelectedPage] = useState(0);
  const phone = usePhone();
  const [half, setHalf] = useState<"left" | "right">("left");
  const index = Math.min(selectedPage, Math.max(0, config.pages.length - 1));
  const page = config.pages[index];
  const layout = page && getZineLayout(page.layout);
  const drafts = useRef(new Map<string, Record<string, string>>());
  const used = new Set(config.pages.flatMap((p) => p.photo_ids));
  const missing = photos.filter((p) => !used.has(p.id));
  function update(next: ZinePage) {
    onChange({
      ...config,
      pages: config.pages.map((p, i) => (i === index ? next : p)),
    });
  }
  function move(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= config.pages.length) return;
    const pages = [...config.pages];
    [pages[index], pages[next]] = [pages[next], pages[index]];
    onChange({ ...config, pages });
    setSelectedPage(next);
  }
  return (
    <section className="story-panel zine-editor" aria-label="Zine 版面与文字">
      <div className="story-section-heading">
        <span>04</span>
        <h2>版面与文字</h2>
        <small>照片资料自动读取，短句可以自己写</small>
      </div>
      <div className="zine-editor-toolbar">
        <label>
          当前版面
          <select
            value={index}
            onChange={(e) => {
              setSelectedPage(Number(e.target.value));
              setHalf("left");
            }}
          >
            {config.pages.map((p, i) => (
              <option key={p.id} value={i}>
                第 {i + 1} 个跨页 · {getZineLayout(p.layout)?.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!page || index === 0}
          onClick={() => move(-1)}
          aria-label="版面前移"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          disabled={!page || index === config.pages.length - 1}
          onClick={() => move(1)}
          aria-label="版面后移"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          disabled={!photos.length || config.pages.length >= 60}
          onClick={() => {
            const added = newZineConfig([missing[0] || photos[0]], template)
              .pages[0];
            onChange({ ...config, pages: [...config.pages, added] });
            setSelectedPage(config.pages.length);
          }}
        >
          <Plus size={16} />
          添加版面
        </button>
      </div>
      {page && layout ? (
        <>
          <label className="zine-layout-label">
            这一页的排版
            <select
              value={page.layout}
              onChange={(e) => {
                const next = getZineLayout(e.target.value)!;
                drafts.current.set(`${page.id}/${page.layout}`, page.texts);
                const saved = drafts.current.get(`${page.id}/${next.id}`);
                const texts =
                  saved ||
                  Object.fromEntries(
                    Object.entries(page.texts).filter(([key]) =>
                      next.fields.some((f) => f.key === key),
                    ),
                  );
                update({
                  ...page,
                  layout: next.id,
                  texts,
                  photo_ids: Array.from(
                    { length: next.slots },
                    (_, i) => page.photo_ids[i] || null,
                  ),
                });
              }}
            >
              {collection.spreads.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.slots} 张照片
                </option>
              ))}
            </select>
          </label>
          {phone && (
            <div className="zine-half-controls">
              <button
                type="button"
                aria-pressed={half === "left"}
                onClick={() => setHalf("left")}
              >
                预览左页
              </button>
              <button
                type="button"
                aria-pressed={half === "right"}
                onClick={() => setHalf("right")}
              >
                预览右页
              </button>
            </div>
          )}
          <ZineSpread
            collection={collection}
            page={page}
            photos={photos}
            title={title || "你的影集"}
            index={index}
            view={phone ? half : "spread"}
            renderPhoto={renderPhoto}
            background={config.background_color}
          />
          <div className="zine-edit-columns">
            <div>
              <h3>照片位置</h3>
              <p className="zine-help">
                标题、拍摄时间和地点跟随这里选择的照片。
              </p>
              {page.photo_ids.map((id, slot) => (
                <label key={slot}>
                  照片位置 {slot + 1}
                  <select
                    value={id || ""}
                    onChange={(e) =>
                      update({
                        ...page,
                        photo_ids: page.photo_ids.map((v, i) =>
                          i === slot ? e.target.value || null : v,
                        ),
                      })
                    }
                  >
                    <option value="">暂不放照片</option>
                    {photos.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={page.photo_ids.includes(p.id) && id !== p.id}
                      >
                        {p.title || "未命名照片"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <div className="zine-auto-fields" aria-label="自动照片资料">
                {page.photo_ids.map((id, slot) => {
                  const p = photos.find((p) => p.id === id);
                  return p ? (
                    <div key={`${slot}-${id}`}>
                      <strong>
                        位置 {slot + 1} · {p.title || "未命名照片"}
                      </strong>
                      <span>{p.location_label || "未填写地点"}</span>
                      <span>
                        {p.captured_local?.replace("T", " ") ||
                          "未填写拍摄时间"}
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div>
              <h3>自己写的文字</h3>
              <p className="zine-help">
                文字位置和字体由模板安排，留空即可隐藏。
              </p>
              {layout.fields.map((field) => (
                <label key={`${page.id}/${field.key}`}>
                  {field.label}
                  <textarea
                    aria-label={field.label}
                    rows={field.multiline ? 3 : 2}
                    maxLength={field.maxLength}
                    value={page.texts[field.key] ?? field.default}
                    onChange={(e) =>
                      update({
                        ...page,
                        texts: { ...page.texts, [field.key]: e.target.value },
                      })
                    }
                    placeholder={
                      field.default ? undefined : "写下这一页想留下的话"
                    }
                  />
                  <small>
                    {(page.texts[field.key] ?? field.default).length}/
                    {field.maxLength}
                  </small>
                </label>
              ))}
              {!layout.fields.length && (
                <p className="zine-help">这一页使用自动照片资料。</p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="zine-remove-page"
            disabled={config.pages.length < 2}
            onClick={() => {
              onChange({
                ...config,
                pages: config.pages.filter((_, i) => i !== index),
              });
              setSelectedPage(Math.max(0, index - 1));
            }}
          >
            移除这个版面
          </button>
        </>
      ) : (
        <p className="story-muted">先选照片，系统会自动生成版面。</p>
      )}
      {!!missing.length && (
        <p className="zine-unassigned">
          还有 {missing.length} 张所选照片未安排到版面。
          <button
            type="button"
            onClick={() => onChange(syncZineConfig(config, photos, template))}
          >
            补齐未安排照片
          </button>
        </p>
      )}
    </section>
  );
}

export function ZinePlayer({
  story,
  renderPhoto,
  prefetch,
  toolbar,
  publicView = false,
}: {
  story: {
    id: string;
    title: string;
    template: ZineTemplate;
    transition: string;
    is_owner: boolean;
    zine_config?: ZineConfig | null;
    photos: ZinePhoto[];
  };
  renderPhoto: (photo: ZinePhoto) => ReactNode;
  prefetch?: (ids: Array<string | null>) => void;
  toolbar?: ReactNode;
  publicView?: boolean;
}) {
  const phone = usePhone();
  const config = useMemo(
    () => story.zine_config || newZineConfig(story.photos, story.template),
    [story],
  );
  const collection = getZineCollection(story.template);
  const pages = config.pages;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState("next");
  const [previousStep, setPreviousStep] = useState<number | null>(null);
  const steps = pages.length * (phone ? 2 : 1);
  const index = Math.min(step, Math.max(0, steps - 1));
  const pageIndex = phone ? Math.floor(index / 2) : index;
  const page = pages[pageIndex];
  const touch = useRef<{ x: number; y: number } | null>(null);
  function go(next: number) {
    if (next < 0 || next >= steps || next === index) return;
    setPreviousStep(index);
    setDirection(next > index ? "next" : "previous");
    setStep(next);
    if (next === steps - 1) setPlaying(false);
  }
  useEffect(() => {
    setStep(0);
    setPlaying(false);
    setPreviousStep(null);
  }, [phone]);
  useEffect(() => {
    if (previousStep === null) return;
    const timer = window.setTimeout(() => setPreviousStep(null), 450);
    return () => window.clearTimeout(timer);
  }, [step, previousStep]);
  useEffect(() => {
    if (!playing || steps < 2) return;
    const timer = window.setTimeout(() => go(index + 1), 6000);
    return () => window.clearTimeout(timer);
  }, [playing, index, steps]);
  useEffect(() => {
    prefetch?.(pages[pageIndex + 1]?.photo_ids || []);
  }, [pageIndex, story]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,button,[contenteditable=true]",
        )
      )
        return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      }
      if (e.key === "Escape") location.hash = "/stories";
      if (e.code === "Space") {
        if (steps < 2) return;
        e.preventDefault();
        if (index === steps - 1) setStep(0);
        setPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, steps]);
  return (
    <div
      className={`story-player zine-book-player story-template-${story.template}`}
      role="region"
      aria-label={`影集 ${story.title}`}
    >
      <header className="story-player-header">
        <a href={publicView ? "#/featured" : "#/stories"} aria-label="关闭影集">
          <X size={25} />
        </a>
        <span>{story.title}</span>
        <div>
          {toolbar}
          {story.is_owner && (
            <a href={`#/stories/${story.id}/edit`}>编辑影集</a>
          )}
          <span>
            {index + 1} / {steps}
          </span>
        </div>
      </header>
      <div
        className="zine-player-stage"
        onTouchStart={(e) => {
          touch.current = {
            x: e.changedTouches[0].clientX,
            y: e.changedTouches[0].clientY,
          };
        }}
        onTouchEnd={(e) => {
          if (
            !touch.current ||
            (e.target as HTMLElement).closest("details,input,button")
          )
            return;
          const dx = e.changedTouches[0].clientX - touch.current.x,
            dy = e.changedTouches[0].clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.3)
            go(index + (dx < 0 ? 1 : -1));
        }}
      >
        {page ? (
          [previousStep, index]
            .filter((value): value is number => value !== null)
            .map((value, layer) => {
              const frameIndex = phone ? Math.floor(value / 2) : value;
              const framePage = pages[frameIndex];
              const leaving = previousStep !== null && layer === 0;
              return (
                <div
                  key={`${framePage.id}/${phone ? value % 2 : "spread"}`}
                  aria-hidden={leaving || undefined}
                  className={`zine-player-turn zine-slide-${leaving ? "out" : previousStep === null ? "still" : "in"} zine-effect-${story.transition} story-direction-${direction}`}
                >
                  <ZineSpread
                    collection={collection}
                    page={framePage}
                    photos={story.photos}
                    title={story.title}
                    index={frameIndex}
                    view={phone ? (value % 2 ? "right" : "left") : "spread"}
                    renderPhoto={renderPhoto}
                    background={config.background_color}
                    onReadOpen={() => setPlaying(false)}
                  />
                </div>
              );
            })
        ) : (
          <p>这本影集暂时没有版面。</p>
        )}
        <button
          type="button"
          className="story-player-arrow previous"
          aria-label="上一页"
          disabled={!index}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft size={24} />
        </button>
        <button
          type="button"
          className="story-player-arrow next"
          aria-label="下一页"
          disabled={index >= steps - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRight size={24} />
        </button>
      </div>
      <footer className="story-player-footer">
        <div className="story-player-controls">
          <button
            type="button"
            disabled={steps < 2}
            aria-label={playing ? "暂停放映" : "自动放映"}
            onClick={() => {
              if (index === steps - 1) setStep(0);
              setPlaying((v) => !v);
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
            <span>{playing ? "暂停" : "自动放映"}</span>
          </button>
        </div>
        <select
          className="zine-page-select"
          value={index}
          aria-label="影集页码"
          onChange={(e) => {
            setPlaying(false);
            go(Number(e.target.value));
          }}
        >
          {Array.from({ length: steps }, (_, i) => (
            <option key={i} value={i}>
              第 {i + 1} 页
            </option>
          ))}
        </select>
        <span className="story-player-count">
          {String(index + 1).padStart(2, "0")} /{" "}
          {String(steps).padStart(2, "0")}
        </span>
      </footer>
    </div>
  );
}
