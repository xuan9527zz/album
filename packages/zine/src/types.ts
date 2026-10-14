export type ZineTheme = "city" | "diary" | "coast";
export type ZineTemplate = `zine-${ZineTheme}`;
export const zineLayoutIds = [
  "city-opening",
  "city-pause",
  "city-sequence",
  "city-window",
  "diary-opening",
  "diary-band",
  "diary-small",
  "diary-keepsakes",
  "coast-opening",
  "coast-layer",
  "coast-band",
  "coast-ending",
] as const;
export type ZineLayoutId = (typeof zineLayoutIds)[number];
export interface ZinePhoto {
  id: string;
  title: string | null;
  captured_local: string | null;
  location_label: string | null;
  src?: string;
}
export interface ZinePage {
  id: string;
  layout: ZineLayoutId;
  photo_ids: Array<string | null>;
  texts: Record<string, string>;
}
export interface ZineConfig {
  version: 1;
  background_color?: string;
  pages: ZinePage[];
}
export type TextBinding =
  | { source: "storyTitle" | "pageNumber" | "folioLeft" | "folioRight" }
  | {
      source: "photo";
      slot: number;
      field: "title" | "date" | "location" | "meta" | "caption";
    }
  | { source: "manual"; key: string }
  | { source: "fixed"; value: string };
export interface ZineNode {
  id: string;
  type: "photo" | "text" | "block";
  x: number;
  y: number;
  w: number;
  h: number;
  slot?: number;
  position?: string;
  opacity?: number;
  font?: string;
  size?: number;
  binding?: TextBinding;
  lineHeight?: number;
  weight?: number;
  color?: string;
  tracking?: number;
  align?: "left" | "right" | "center";
  italic?: boolean;
  vertical?: boolean;
  angle?: number;
}
export interface ZineTextField {
  key: string;
  label: string;
  maxLength: number;
  default: string;
  multiline: boolean;
}
export interface ZineLayout {
  id: ZineLayoutId;
  name: string;
  note: string;
  slots: number;
  nodes: ZineNode[];
  fields: ZineTextField[];
}
export interface ZineCollection {
  id: ZineTheme;
  name: string;
  subtitle: string;
  fonts: string;
  paper: string;
  ink: string;
  accent: string;
  description: string;
  spreads: ZineLayout[];
}
