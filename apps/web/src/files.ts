import exifr from "exifr";
import {
  assetSchema,
  type AssetSpec,
  type Metadata,
} from "../../../packages/shared/src/index";
export function workerTask<T>(
  worker: Worker,
  blob: unknown,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (e) => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data);
    };
    worker.onerror = () => {
      signal.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error("图片处理失败"));
    };
    worker.postMessage(blob);
  });
}
export function fileMime(file: File) {
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        heic: "image/heic",
        heif: "image/heif",
        hif: "image/heif",
        mov: "video/quicktime",
        mp4: "video/mp4",
      } as Record<string, string>
    )[ext || ""] || file.type
  );
}
export async function specification(
  file: File,
  role: AssetSpec["role"],
  provenance: AssetSpec["provenance"],
  signal: AbortSignal,
): Promise<AssetSpec> {
  const mime = fileMime(file);
  if (file.size > (role === "live_video" ? 128 : 64) * 1024 ** 2 || !file.size)
    throw new Error("文件为空或超过上传大小限制");
  const hashes = await workerTask<{ md5: string; sha256: string }>(
    new Worker(new URL("./hash.worker.ts", import.meta.url), {
      type: "module",
    }),
    file,
    signal,
  );
  return assetSchema.parse({
    role,
    filename: file.name,
    mime,
    size: file.size,
    provenance,
    ...hashes,
  });
}
export function localEXIFDate(value: unknown): string | null {
  // EXIF has no timezone unless OffsetTimeOriginal is present. Never use toISOString here.
  if (typeof value !== "string") return null;
  const match = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  return match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
    : null;
}
export async function metadata(file: File): Promise<Metadata> {
  const result: Metadata = {
    date_source: "unknown",
    location_source: "unknown",
    is_featured: false,
  };
  try {
    const x = await exifr.parse(file, {
      translateValues: false,
      reviveValues: false,
      pick: [
        "DateTimeOriginal",
        "OffsetTimeOriginal",
        "GPSLatitude",
        "GPSLongitude",
        "GPSLatitudeRef",
        "GPSLongitudeRef",
      ],
    });
    result.captured_local = localEXIFDate(x?.DateTimeOriginal);
    if (result.captured_local) result.date_source = "exif";
    const offset = String(x?.OffsetTimeOriginal || "").match(
      /^([+-])(\d{2}):(\d{2})$/,
    );
    if (offset)
      result.capture_offset_minutes =
        (offset[1] === "-" ? -1 : 1) *
        (Number(offset[2]) * 60 + Number(offset[3]));
    const gps = await exifr.gps(file);
    if (
      gps &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      result.latitude = gps.latitude;
      result.longitude = gps.longitude;
      result.location_source = "exif";
    }
  } catch {
    /* Missing metadata is valid. */
  }
  return result;
}
export async function derivatives(
  file: File,
  signal: AbortSignal,
): Promise<
  { role: "preview" | "thumbnail"; blob: Blob; width: number; height: number }[]
> {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  )
    return (
      await workerTask<{ outputs: any[] }>(
        new Worker(new URL("./image.worker.ts", import.meta.url), {
          type: "module",
        }),
        { file, heic: /heic|heif/.test(fileMime(file)) },
        signal,
      )
    ).outputs;
  let source: Blob = file;
  if (/heic|heif/.test(fileMime(file)))
    source = await (
      await import("heic-to")
    ).heicTo({ blob: file, type: "image/jpeg", quality: 0.94 });
  const objectURL = URL.createObjectURL(source);
  const image = new Image();
  image.src = objectURL;
  try {
    await image.decode();
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (image.width * image.height > 80_000_000)
      throw new Error("图片尺寸过大");
    return await Promise.all(
      (["preview", "thumbnail"] as const).map(async (role) => {
        const factor = Math.min(
          1,
          (role === "preview" ? 2048 : 600) /
            Math.max(image.width, image.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * factor);
        canvas.height = Math.round(image.height * factor);
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (x) => (x ? resolve(x) : reject(new Error("生成预览失败"))),
            "image/jpeg",
            0.86,
          ),
        );
        return { role, blob, width: canvas.width, height: canvas.height };
      }),
    );
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}
