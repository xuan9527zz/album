import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { clamp, cropGeometry } from "./crop";
import type { ZineCrop } from "./types";

export function ZinePhotoFrame({
  width,
  height,
  position,
  crop,
  children,
  onChange,
}: {
  width: number;
  height: number;
  position?: string;
  crop?: ZineCrop | null;
  children: ReactNode;
  onChange?: (crop: ZineCrop) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: width, h: height });
  const points = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    x: number;
    y: number;
    distance: number;
    crop: ZineCrop;
    rect: DOMRect;
  } | null>(null);
  const geometry = cropGeometry(size.w, size.h, width, height, crop, position);
  const latest = useRef<ZineCrop>(geometry);
  useLayoutEffect(() => {
    latest.current = { zoom: geometry.zoom, x: geometry.x, y: geometry.y };
  }, [crop, size]);
  const measure = () => {
    const img = box.current?.querySelector("img");
    if (img?.naturalWidth && img.naturalHeight)
      setSize({ w: img.naturalWidth, h: img.naturalHeight });
  };
  useLayoutEffect(measure, [children]);
  function midpoint() {
    const [a, b] = [...points.current.values()];
    if (!a) return null;
    return b
      ? {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : { ...a, distance: 0 };
  }
  function rebase() {
    const center = midpoint(),
      rect = box.current?.getBoundingClientRect();
    gesture.current =
      center && rect ? { ...center, crop: { ...latest.current }, rect } : null;
  }
  function end(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    points.current.delete(event.pointerId);
    rebase();
  }
  function touches(event: TouchEvent) {
    points.current = new Map(
      Array.from(event.touches, (t) => [
        t.identifier,
        { x: t.clientX, y: t.clientY },
      ]),
    );
  }
  function move() {
    const center = midpoint(),
      start = gesture.current;
    if (!center || !start || !onChange) return;
    const zoom = clamp(
      start.crop.zoom * (start.distance ? center.distance / start.distance : 1),
      1,
      5,
    );
    const ratio = zoom / start.crop.zoom;
    const next = cropGeometry(size.w, size.h, width, height, {
      zoom,
      x:
        start.crop.x * ratio +
        (center.x - start.x) / start.rect.width +
        ((start.x - start.rect.left) / start.rect.width - 0.5) * (1 - ratio),
      y:
        start.crop.y * ratio +
        (center.y - start.y) / start.rect.height +
        ((start.y - start.rect.top) / start.rect.height - 0.5) * (1 - ratio),
    });
    latest.current = {
      zoom: next.zoom,
      x: clamp(next.x, -2, 2),
      y: clamp(next.y, -2, 2),
    };
    onChange(latest.current);
  }
  return (
    <div
      ref={box}
      className={`zine-photo-frame${onChange ? " zine-photo-adjustable" : ""}`}
      onLoadCapture={measure}
      onPointerDown={
        onChange
          ? (event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              if (event.pointerType === "touch") return;
              event.preventDefault();
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                /* A cancelled touch may already have ended. */
              }
              points.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              rebase();
            }
          : undefined
      }
      onPointerMove={
        onChange
          ? (event) => {
              if (
                event.pointerType === "touch" ||
                !points.current.has(event.pointerId) ||
                !gesture.current
              )
                return;
              event.preventDefault();
              points.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
              move();
            }
          : undefined
      }
      onPointerUp={onChange ? end : undefined}
      onPointerCancel={onChange ? end : undefined}
      onLostPointerCapture={onChange ? end : undefined}
      onTouchStart={
        onChange
          ? (event) => {
              touches(event);
              rebase();
            }
          : undefined
      }
      onTouchMove={
        onChange
          ? (event) => {
              touches(event);
              move();
            }
          : undefined
      }
      onTouchEnd={
        onChange
          ? (event) => {
              touches(event);
              rebase();
            }
          : undefined
      }
      onTouchCancel={
        onChange
          ? () => {
              points.current.clear();
              gesture.current = null;
            }
          : undefined
      }
      onDragStart={(event) => event.preventDefault()}
    >
      <div
        className="zine-photo-content"
        style={{
          left: `${(geometry.left / width) * 100}%`,
          top: `${(geometry.top / height) * 100}%`,
          width: `${(geometry.width / width) * 100}%`,
          height: `${(geometry.height / height) * 100}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
