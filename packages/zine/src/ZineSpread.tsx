import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { getZineLayout, resolveZineText } from "./model";
import { ZineFonts, zineFontFamilies } from "./ZineFonts";
import type { ZineCollection, ZineNode, ZinePage, ZinePhoto } from "./types";
import "./zine.css";
import { contrastInk } from "./color";
import { ZinePhotoFrame } from "./ZinePhotoFrame";
import type { ZineCrop } from "./types";

function FittedText({
  node,
  value,
  ink,
}: {
  node: ZineNode;
  value: string;
  ink: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let active = true;
    const fit = () => {
      const box = element.current;
      if (!active || !box) return;
      box.textContent = value;
      delete box.dataset.truncated;
      let low = Math.min(node.size || 16, 14),
        high = node.size || 16;
      box.style.fontSize = high + "px";
      const fits = () =>
        box.scrollWidth <= box.clientWidth + 1 &&
        box.scrollHeight <= box.clientHeight + 1;
      if (fits()) return;
      for (let i = 0; i < 9; i++) {
        const mid = (low + high) / 2;
        box.style.fontSize = mid + "px";
        if (fits()) low = mid;
        else high = mid;
      }
      box.style.fontSize = low + "px";
      if (!fits()) {
        // Keep a visible ellipsis in the fixed box; full text remains in aria-label and the reading panel.
        const parts = Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            value,
          ),
          (part) => part.segment,
        );
        let start = 0,
          end = parts.length;
        while (start < end) {
          const length = Math.ceil((start + end) / 2);
          box.textContent = parts.slice(0, length).join("") + "…";
          if (fits()) start = length;
          else end = length - 1;
        }
        box.textContent = parts.slice(0, start).join("") + "…";
        box.dataset.truncated = "true";
      }
    };
    fit();
    void document.fonts?.ready.then(fit);
    return () => {
      active = false;
    };
  }, [value, node]);
  const style: CSSProperties = {
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    fontFamily: `${zineFontFamilies[node.font || "Inter"]}, ${node.font === "Inter" ? "ZineHanSans, sans-serif" : "ZineHanSerif, serif"}`,
    fontSize: node.size,
    fontWeight: node.weight || 400,
    fontStyle: node.italic ? "italic" : "normal",
    lineHeight: node.lineHeight || 1.25,
    letterSpacing: node.tracking || 0,
    color: node.color || ink,
    textAlign: node.align || "left",
    writingMode: node.vertical ? "vertical-rl" : undefined,
    textOrientation:
      node.vertical && ["HanSerif", "Huiwen"].includes(node.font || "")
        ? "upright"
        : undefined,
  };
  return (
    <div
      ref={element}
      className="zine-node zine-text"
      style={style}
      data-node={node.id}
      aria-label={value}
    >
      {value}
    </div>
  );
}
export function ZineSpread({
  collection,
  page,
  photos,
  title,
  index = 0,
  view = "spread",
  renderPhoto,
  onReadOpen,
  showDetails = true,
  background,
  onPhotoCrop,
}: {
  collection: ZineCollection;
  page: ZinePage;
  photos: readonly ZinePhoto[];
  title: string;
  index?: number;
  view?: "spread" | "left" | "right";
  renderPhoto?: (photo: ZinePhoto) => ReactNode;
  onReadOpen?: () => void;
  showDetails?: boolean;
  background?: string;
  onPhotoCrop?: (slot: number, crop: ZineCrop) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const lookup = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const layout = getZineLayout(page.layout);
  useLayoutEffect(() => {
    const target = frame.current;
    if (!target) return;
    const resize = () => setWidth(target.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  if (!layout) return null;
  const scale = width / (view === "spread" ? 1440 : 720);
  const ink = background ? contrastInk(background) : collection.ink;
  return (
    <div className="zine-reading">
      <ZineFonts />
      <div className={`zine-frame zine-view-${view}`} ref={frame}>
        <article
          className="zine-canvas"
          aria-label={`${collection.name} · ${layout.name}`}
          style={{
            background: background || collection.paper,
            color: ink,
            transform: `scale(${scale}) translateX(${view === "right" ? -720 : 0}px)`,
          }}
        >
          {layout.nodes.map((node) => {
            if (node.type === "text" && node.binding) {
              const value = resolveZineText(
                node.binding,
                page,
                lookup,
                title,
                index,
              );
              return value ? (
                <FittedText
                  key={node.id}
                  node={
                    background &&
                    node.color?.toLowerCase() === collection.ink.toLowerCase()
                      ? { ...node, color: ink }
                      : node
                  }
                  value={value}
                  ink={ink}
                />
              ) : null;
            }
            const style: CSSProperties = {
              left: node.x,
              top: node.y,
              width: node.w,
              height: node.h,
              opacity: node.opacity,
              transform: node.angle ? `rotate(${node.angle}deg)` : undefined,
            };
            if (node.type === "block")
              return (
                <div
                  key={node.id}
                  className="zine-node zine-block"
                  style={{
                    ...style,
                    background:
                      background &&
                      node.color?.toLowerCase() ===
                        collection.paper.toLowerCase()
                        ? background
                        : node.color,
                  }}
                  aria-hidden="true"
                />
              );
            const id = page.photo_ids[node.slot || 0];
            const photo = id ? lookup.get(id) : undefined;
            return (
              <figure
                key={node.id}
                data-photo-slot={node.slot || 0}
                className="zine-node zine-photo"
                style={
                  {
                    ...style,
                    "--zine-position": node.position || "center",
                  } as CSSProperties
                }
              >
                {photo ? (
                  <ZinePhotoFrame
                    width={node.w}
                    height={node.h}
                    position={node.position}
                    crop={page.photo_crops?.[node.slot || 0]}
                    onChange={
                      onPhotoCrop
                        ? (crop) => onPhotoCrop(node.slot || 0, crop)
                        : undefined
                    }
                  >
                    {renderPhoto ? (
                      renderPhoto(photo)
                    ) : (
                      <img src={photo.src} alt={photo.title || "影集照片"} />
                    )}
                  </ZinePhotoFrame>
                ) : (
                  <span className="zine-photo-unavailable">
                    此位置暂无可用照片
                  </span>
                )}
              </figure>
            );
          })}
        </article>
      </div>
      {showDetails && (
        <details
          className="zine-reading-text"
          onToggle={(event) => {
            if (event.currentTarget.open) onReadOpen?.();
          }}
        >
          <summary>查看文字与照片资料</summary>
          {page.photo_ids.map((id, slot) => {
            const photo = id ? lookup.get(id) : undefined;
            return photo ? (
              <div key={`${slot}-${id}`}>
                <strong>{photo.title || "未命名照片"}</strong>
                <p>{photo.location_label}</p>
                <p>{photo.captured_local?.replace("T", " ")}</p>
              </div>
            ) : null;
          })}
          {layout.fields.map((field) => {
            const value = page.texts[field.key] ?? field.default;
            return value ? (
              <div key={field.key}>
                <strong>{field.label}</strong>
                <p>{value}</p>
              </div>
            ) : null;
          })}
        </details>
      )}
    </div>
  );
}
