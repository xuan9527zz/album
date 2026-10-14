const extensions: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/heic": ["heic", "hif"],
  "image/heif": ["heif", "hif"],
  "video/quicktime": ["mov"],
  "video/mp4": ["mp4"],
};
export function photoFilename(
  user: string,
  photoID: string,
  mime: string,
  sourceName = "",
) {
  const name =
    user
      .trim()
      .replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, "_")
      .replace(/[. ]+$/, "") || "用户";
  const allowed = extensions[mime] || ["jpg"];
  const sourceExtension = sourceName.split(".").at(-1)?.toLowerCase() || "";
  const extension = allowed.includes(sourceExtension)
    ? sourceExtension
    : allowed[0];
  return `${name}_${photoID}.${extension}`;
}
