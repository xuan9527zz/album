import { heicTo } from "heic-to/next";
self.onmessage = async (event: MessageEvent<{ file: File; heic: boolean }>) => {
  try {
    let blob: Blob = event.data.file;
    if (event.data.heic)
      blob = await heicTo({ blob, type: "image/jpeg", quality: 0.94 });
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
    if (bitmap.width * bitmap.height > 80_000_000) {
      bitmap.close();
      throw new Error("图片尺寸过大");
    }
    const outputs = [];
    for (const [role, size, quality] of [
      ["preview", 2048, 0.86],
      ["thumbnail", 600, 0.8],
    ] as const) {
      const factor = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.round(bitmap.width * factor)),
        Math.max(1, Math.round(bitmap.height * factor)),
      );
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      outputs.push({
        role,
        blob: await canvas.convertToBlob({ type: "image/jpeg", quality }),
        width: canvas.width,
        height: canvas.height,
      });
    }
    bitmap.close();
    self.postMessage({ outputs });
  } catch {
    self.postMessage({
      error: "原件已保存，暂时无法生成浏览图片。可稍后重试或补传JPEG预览。",
    });
  }
};
