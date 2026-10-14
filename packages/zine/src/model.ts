import { zineCollections } from "./catalog";
import type {
  TextBinding,
  ZineConfig,
  ZineLayout,
  ZinePage,
  ZinePhoto,
  ZineTemplate,
  ZineTheme,
} from "./types";

export const isZineTemplate = (value: string): value is ZineTemplate =>
  ["zine-city", "zine-diary", "zine-coast"].includes(value);
export const getZineCollection = (value: ZineTheme | ZineTemplate) =>
  zineCollections.find((c) => c.id === value.replace("zine-", ""))!;
export const getZineLayout = (id: string): ZineLayout | undefined =>
  zineCollections.flatMap((c) => c.spreads).find((p) => p.id === id);
export function photoDate(photo?: ZinePhoto) {
  const date = photo?.captured_local;
  return date ? date.slice(0, 16).replaceAll("-", ".").replace("T", " ") : "";
}
export function photoText(
  photo: ZinePhoto | undefined,
  field: "title" | "date" | "location" | "meta" | "caption",
) {
  if (!photo) return "";
  if (field === "title") return photo.title?.trim() || "";
  if (field === "date") return photoDate(photo);
  if (field === "location") return photo.location_label?.trim() || "";
  const meta = [photo.location_label?.trim(), photoDate(photo)]
    .filter(Boolean)
    .join(" · ");
  return field === "meta"
    ? meta
    : [photo.title?.trim(), meta].filter(Boolean).join("\n");
}
export function resolveZineText(
  binding: TextBinding,
  page: ZinePage,
  photos: ReadonlyMap<string, ZinePhoto>,
  storyTitle: string,
  index: number,
) {
  switch (binding.source) {
    case "storyTitle":
      return storyTitle;
    case "pageNumber":
      return String(index + 1).padStart(2, "0");
    case "folioLeft":
      return String(index * 2 + 1).padStart(2, "0");
    case "folioRight":
      return String(index * 2 + 2).padStart(2, "0");
    case "fixed":
      return binding.value;
    case "photo": {
      const id = page.photo_ids[binding.slot];
      return photoText(id ? photos.get(id) : undefined, binding.field);
    }
    case "manual": {
      const field = getZineLayout(page.layout)?.fields.find(
        (f) => f.key === binding.key,
      );
      return page.texts[binding.key] ?? field?.default ?? "";
    }
  }
}
function makePage(layout: ZineLayout, ids: string[]): ZinePage {
  return {
    id: crypto.randomUUID(),
    layout: layout.id,
    photo_ids: Array.from({ length: layout.slots }, (_, i) => ids[i] || null),
    texts: {},
  };
}
export function newZineConfig(
  photos: readonly ZinePhoto[],
  theme: ZineTheme | ZineTemplate,
): ZineConfig {
  const collection = getZineCollection(theme);
  if (!photos.length) return { version: 1, pages: [] };
  const pages = [makePage(collection.spreads[0], [photos[0].id])];
  const pair = collection.spreads.find((p) => p.slots === 2)!;
  const single = collection.spreads.find((p, i) => i > 0 && p.slots === 1)!;
  for (let i = 1; i < photos.length; i += 2) {
    const chunk = photos.slice(i, i + 2).map((p) => p.id);
    pages.push(makePage(chunk.length === 2 ? pair : single, chunk));
  }
  return { version: 1, pages };
}
/** Reordering pages or changing metadata never moves a slot to a different photo. */
export function syncZineConfig(
  config: ZineConfig | null,
  photos: readonly ZinePhoto[],
  theme: ZineTheme | ZineTemplate,
): ZineConfig {
  const collection = getZineCollection(theme);
  if (
    !config ||
    config.pages.some((p) => !collection.spreads.some((l) => l.id === p.layout))
  )
    return newZineConfig(photos, theme);
  const available = new Set(photos.map((p) => p.id));
  const pages = config.pages
    .map((p) => ({
      ...p,
      photo_ids: p.photo_ids.map((id) => (id && available.has(id) ? id : null)),
    }))
    .filter((p) => p.photo_ids.some(Boolean));
  const used = new Set(pages.flatMap((p) => p.photo_ids).filter(Boolean));
  const missing = photos.filter((p) => !used.has(p.id));
  if (!pages.length) return newZineConfig(photos, theme);
  const single = collection.spreads.find((p, i) => i > 0 && p.slots === 1)!;
  return {
    version: 1,
    ...(config.background_color
      ? { background_color: config.background_color }
      : {}),
    pages: [...pages, ...missing.map((p) => makePage(single, [p.id]))],
  };
}
