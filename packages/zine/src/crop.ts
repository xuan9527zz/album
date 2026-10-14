import type { ZineCrop } from "./types";

export const defaultCrop: ZineCrop = { zoom: 1, x: 0, y: 0 };
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Normalized offsets let the editor, reader and PDF use the same framing.
export function cropGeometry(
  iw: number,
  ih: number,
  fw: number,
  fh: number,
  crop?: ZineCrop | null,
  position = "50% 50%",
) {
  const zoom = clamp(crop?.zoom ?? 1, 1, 5);
  const scale = Math.max(fw / iw, fh / ih) * zoom;
  const width = iw * scale,
    height = ih * scale;
  const parts = position.split(" ").map((part) => {
    if (part === "left" || part === "top") return 0;
    if (part === "right" || part === "bottom") return 1;
    const n = parseFloat(part);
    return Number.isFinite(n) ? clamp(n / 100, 0, 1) : 0.5;
  });
  const baseX = crop ? (fw - width) / 2 : (fw - width) * (parts[0] ?? 0.5);
  const baseY = crop
    ? (fh - height) / 2
    : (fh - height) * (parts[1] ?? parts[0] ?? 0.5);
  const left = clamp(baseX + (crop?.x ?? 0) * fw, fw - width, 0);
  const top = clamp(baseY + (crop?.y ?? 0) * fh, fh - height, 0);
  return {
    left,
    top,
    width,
    height,
    zoom,
    x: (left + width / 2 - fw / 2) / fw,
    y: (top + height / 2 - fh / 2) / fh,
  };
}
