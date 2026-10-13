import { z } from "zod";
export const roles = [
  "original_image",
  "live_video",
  "preview",
  "thumbnail",
] as const;
export type Role = (typeof roles)[number];
export const assetSchema = z
  .object({
    role: z.enum(roles),
    filename: z
      .string()
      .min(1)
      .max(240)
      .refine((s) => !/[\x00-\x1f\\/]/.test(s)),
    mime: z.enum([
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif",
      "video/quicktime",
      "video/mp4",
    ]),
    size: z
      .number()
      .int()
      .positive()
      .max(128 * 1024 ** 2),
    md5: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    provenance: z.enum(["browser_selected", "file_imported"]),
    width: z.number().int().positive().max(100000).nullable().optional(),
    height: z.number().int().positive().max(100000).nullable().optional(),
  })
  .strict()
  .superRefine((a, c) => {
    if ((a.role === "live_video") !== a.mime.startsWith("video/"))
      c.addIssue({ code: "custom", message: "视频只能作为配套素材" });
    if (a.role !== "live_video" && a.size > 64 * 1024 ** 2)
      c.addIssue({ code: "custom", message: "图片超过64MiB" });
    if (
      ["preview", "thumbnail"].includes(a.role) &&
      !["image/jpeg", "image/png"].includes(a.mime)
    )
      c.addIssue({ code: "custom", message: "浏览图片必须为JPEG或PNG" });
  });
export const metadataSchema = z
  .object({
    captured_local: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/)
      .nullable()
      .optional(),
    capture_offset_minutes: z
      .number()
      .int()
      .min(-840)
      .max(840)
      .nullable()
      .optional(),
    date_source: z.enum(["exif", "manual", "unknown"]).default("unknown"),
    title: z.string().trim().max(80).nullable().optional(),
    location_label: z.string().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    location_source: z.enum(["exif", "manual", "unknown"]).default("unknown"),
    is_featured: z.boolean().default(false),
  })
  .strict()
  .refine(
    (m) => (m.latitude == null) === (m.longitude == null),
    "GPS需要成对坐标",
  );
export const uploadSchema = z
  .object({
    assets: z.array(assetSchema).min(1).max(4),
    metadata: metadataSchema.default({
      date_source: "unknown",
      location_source: "unknown",
      is_featured: false,
    }),
  })
  .strict()
  .refine(
    (x) => new Set(x.assets.map((a) => a.role)).size === x.assets.length,
    "资产角色不能重复",
  );
export const editSchema = z
  .object({
    captured_local: metadataSchema.shape.captured_local,
    title: metadataSchema.shape.title,
    capture_offset_minutes: metadataSchema.shape.capture_offset_minutes,
    location_label: metadataSchema.shape.location_label,
    latitude: metadataSchema.shape.latitude,
    longitude: metadataSchema.shape.longitude,
    is_featured: z.boolean().optional(),
  })
  .strict()
  .refine(
    (m) =>
      (m.latitude === undefined && m.longitude === undefined) ||
      (m.latitude == null) === (m.longitude == null),
    "GPS需要成对坐标",
  );
export type AssetSpec = z.infer<typeof assetSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export interface Asset {
  id: string;
  role: Role;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_value: string;
  checksum_verification: string;
  source_original_verified: boolean;
}
export interface Photo {
  id: string;
  title: string | null;
  captured_local: string | null;
  captured_utc: string | null;
  capture_offset_minutes: number | null;
  date_source: string;
  sort_date: string;
  uploaded_at: string;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  location_source: string;
  is_featured: boolean;
  is_shared: boolean;
  is_owner?: boolean;
  liked_by_me?: boolean;
  like_count?: number;
  owner_name?: string;
  original_status: string;
  preview_status: string;
  live_status: string;
  lifecycle_status: string;
  deleted_at?: string | null;
  assets: Asset[];
}
export interface UploadItem {
  id: string;
  role: Role;
  state: string;
  size_bytes: number;
  mime_type: string;
  original_filename: string;
  md5: string;
  sha256: string;
}
export interface UploadSession {
  id: string;
  photo_id: string;
  state: string;
  expires_at: string;
  items: UploadItem[];
}
export interface Grant {
  asset_id: string;
  url: string;
  headers: Record<string, string>;
  expires_at: string;
}
export const formatBytes = (n: number) =>
  n < 1e6
    ? `${(n / 1000).toFixed(0)} KB`
    : n < 1e9
      ? `${(n / 1e6).toFixed(1)} MB`
      : `${(n / 1e9).toFixed(2)} GB`;
