export type AudioDownloadProgress = { loaded: number; total: number };

// Download the complete file before handing it to the media element. A buffered
// time range alone cannot tell us that all of the original file is present.
export async function downloadAudio(
  source: string,
  signal: AbortSignal,
  progress: (value: AudioDownloadProgress) => void,
  expectedBytes?: number,
) {
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout>;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(abort, 45000);
  };
  resetIdle();
  const deadline = setTimeout(abort, 600000);
  try {
    const response = await fetch(source, {
      signal: controller.signal,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok || !response.body) throw new Error("音乐下载失败，请重试");
    const total =
      expectedBytes || Number(response.headers.get("content-length")) || 0;
    const limit = 40 * 1024 * 1024;
    if (total > limit) throw new Error("这段音乐超过 40 MB，请使用较小的文件");
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let loaded = 0;
    progress({ loaded, total });
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      resetIdle();
      loaded += part.value.byteLength;
      if (loaded > limit)
        throw new Error("这段音乐超过 40 MB，请使用较小的文件");
      chunks.push(new Uint8Array(part.value));
      progress({ loaded, total });
    }
    if (!loaded) throw new Error("音乐文件是空的，请换一个文件");
    if (total && loaded !== total) throw new Error("音乐下载不完整，请重试");
    if (signal.aborted) throw new DOMException("已取消音乐加载", "AbortError");
    return new Blob(chunks, {
      type: response.headers.get("content-type") || "audio/mpeg",
    });
  } catch (error) {
    if (signal.aborted) throw new DOMException("已取消音乐加载", "AbortError");
    if (controller.signal.aborted)
      throw new Error("音乐加载停滞，请重试或静音观看");
    throw error;
  } finally {
    clearTimeout(idle!);
    clearTimeout(deadline);
    signal.removeEventListener("abort", abort);
    controller.abort();
  }
}
