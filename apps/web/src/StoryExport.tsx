import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, FileText, Link2, X } from "lucide-react";
import type { Photo } from "../../../packages/shared/src";
import type { ZineConfig, ZineTemplate } from "../../../packages/zine/src";
import { Client } from "./client";
import { cachedImage } from "./session-image-cache";
import { pdfTask } from "./pdf-task";

export function StoryExport({
  story,
  client,
}: {
  story: {
    id: string;
    title: string;
    template: ZineTemplate;
    zine_config: ZineConfig;
    photos: Photo[];
  };
  client: Client;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState("");
  const [enabled, setEnabled] = useState(false),
    [link, setLink] = useState("");
  const [pdfURL, setPDFURL] = useState(""),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const pdfController = useRef<AbortController | null>(null);
  const linkField = useRef<HTMLInputElement>(null);
  useEffect(() => () => pdfController.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    void client
      .request<{ enabled: boolean }>(`/v1/stories/${story.id}/share`)
      .then((r) => setEnabled(r.enabled))
      .catch((e) => setError(e.message));
  }, [open, story.id, client]);
  useEffect(
    () => () => {
      if (pdfURL) URL.revokeObjectURL(pdfURL);
    },
    [pdfURL],
  );
  async function generateLink() {
    setBusy("正在生成链接…");
    setError("");
    try {
      const result = await client.request<{ token: string }>(
        `/v1/stories/${story.id}/share`,
        {},
        "POST",
      );
      setLink(
        `${location.origin}${import.meta.env.BASE_URL}#/watch/${result.token}`,
      );
      setEnabled(true);
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function revoke() {
    setBusy("正在关闭链接…");
    setError("");
    try {
      await client.request(
        `/v1/stories/${story.id}/share`,
        undefined,
        "DELETE",
      );
      setEnabled(false);
      setLink("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function exportPDF() {
    const controller = new AbortController();
    pdfController.current = controller;
    const abort = () => controller.abort();
    client.controller.signal.addEventListener("abort", abort, { once: true });
    if (client.controller.signal.aborted) controller.abort();
    const prepared = new Map<string, { url: string; bytes: number }>();
    let preparedBytes = 0;
    const ownedURLs: string[] = [];
    let fontWarning = "";
    setBusy("正在准备照片和字体…");
    setError("");
    setNotice("");
    try {
      const current = await pdfTask(
        () =>
          client.request<
            typeof story & { urls: { id: string; url: string }[] }
          >(
            `/v1/stories/${story.id}`,
            undefined,
            "GET",
            undefined,
            controller.signal,
          ),
        controller.signal,
        "影集资料加载超时，请检查网络后重试",
      );
      const urls = Object.fromEntries(
        current.urls.map((item) => [item.id, item.url]),
      );
      const { createZinePDF } = await pdfTask(
        () => import("./zine-pdf"),
        controller.signal,
        "PDF 工具加载超时，请联网后重试",
      );
      const blob = await createZinePDF(
        {
          ...current,
          template: story.template,
          zine_config: current.zine_config || story.zine_config,
        },
        async (photo) => {
          const original = current.photos.find((p) => p.id === photo.id)!;
          const asset =
            original.assets.find((a) => a.role === "preview") ||
            original.assets.find((a) => a.role === "thumbnail");
          if (!asset) throw new Error("有照片尚无预览图，请先生成预览后导出");
          const existing = prepared.get(asset.id)?.url || cachedImage(asset.id);
          if (existing) return existing;
          let source = urls[asset.id];
          if (!source) {
            const fresh = await client.request<{
              urls: { id: string; url: string }[];
            }>(
              "/v1/assets/read-urls",
              { ids: [asset.id] },
              "POST",
              undefined,
              controller.signal,
            );
            source = fresh.urls.find((item) => item.id === asset.id)?.url || "";
          }
          if (!source) throw new Error("照片读取链接不可用，请重试导出");
          // PDF owns these requests and URLs. Cancellation must not abort a
          // shared gallery request, or leave PDF waiting on its pending cache.
          const response = await fetch(source, {
            signal: controller.signal,
            cache: "no-store",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok)
            throw new Error("照片下载失败，请检查网络后重试导出");
          const image = await response.blob();
          if (controller.signal.aborted)
            throw new DOMException("已取消制作 PDF", "AbortError");
          // Keep at most 8 MiB of additional PDF photos, or one larger image.
          // Pages are rendered sequentially, so old decoded sources are idle.
          while (
            prepared.size &&
            preparedBytes + image.size > 8 * 1024 * 1024
          ) {
            const [id, old] = prepared.entries().next().value!;
            URL.revokeObjectURL(old.url);
            prepared.delete(id);
            preparedBytes -= old.bytes;
          }
          const url = URL.createObjectURL(image);
          prepared.set(asset.id, { url, bytes: image.size });
          preparedBytes += image.size;
          ownedURLs.push(url);
          return url;
        },
        (page, total) => setBusy(`正在制作 PDF · ${page}/${total} 页`),
        {
          signal: controller.signal,
          stage: setBusy,
          warning: (message) => {
            fontWarning = message;
          },
        },
      );
      setPDFURL(URL.createObjectURL(blob));
      setNotice(fontWarning);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError")
        setNotice("已取消制作 PDF，可以重新制作。");
      else setError((e as Error).message || "PDF 导出失败，请重试");
    } finally {
      controller.abort();
      client.controller.signal.removeEventListener("abort", abort);
      for (const url of ownedURLs) URL.revokeObjectURL(url);
      if (pdfController.current === controller) pdfController.current = null;
      setBusy("");
    }
  }
  return (
    <>
      <button
        type="button"
        className="story-export-entry"
        aria-label="导出"
        onClick={() => setOpen(true)}
      >
        <Download size={17} />
        <span>导出</span>
      </button>
      {open && (
        <div
          className="story-export-backdrop"
          role="presentation"
          onClick={() => !busy && setOpen(false)}
        >
          <section
            className="story-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="导出影集"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <small>EXPORT</small>
                <h2>导出影集</h2>
              </div>
              <button
                aria-label="关闭导出窗口"
                disabled={!!busy}
                onClick={() => setOpen(false)}
              >
                <X size={22} />
              </button>
            </header>
            <section>
              <h3>
                <Link2 size={19} />
                链接观看
              </h3>
              <p>
                任何拿到链接的人都能查看影集照片、标题、时间和地点。公开链接仅支持本人照片，可随时关闭。
              </p>
              {link && (
                <div className="story-share-link">
                  <input
                    ref={linkField}
                    aria-label="公开观看链接"
                    readOnly
                    value={link}
                  />
                  <button
                    aria-label="复制观看链接"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                      } catch {
                        linkField.current?.select();
                        setCopied(false);
                      }
                    }}
                  >
                    <Copy size={17} />
                    {copied ? "已复制" : "复制"}
                  </button>
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="打开观看链接"
                  >
                    <ExternalLink size={17} />
                  </a>
                </div>
              )}
              <div className="story-export-actions">
                <button disabled={!!busy} onClick={() => void generateLink()}>
                  {enabled ? "重新生成链接" : "生成公开观看链接"}
                </button>
                {enabled && (
                  <button
                    className="subtle"
                    disabled={!!busy}
                    onClick={() => void revoke()}
                  >
                    关闭观看链接
                  </button>
                )}
              </div>
              {enabled && !link && (
                <small>已有观看链接。重新生成会使旧链接失效。</small>
              )}
            </section>
            <section>
              <h3>
                <FileText size={19} />
                PDF 观看
              </h3>
              <p>
                将每个跨页保存为一页 PDF，保留排版和背景色。PDF
                为静态影集，音乐与动画在网页中观看。
              </p>
              <div className="story-export-actions">
                <button disabled={!!busy} onClick={() => void exportPDF()}>
                  {pdfURL ? "重新制作 PDF" : "制作 PDF"}
                </button>
                {pdfURL && (
                  <>
                    <a
                      className="export-primary"
                      href={pdfURL}
                      target="_blank"
                      rel="noopener"
                    >
                      打开 PDF
                    </a>
                    <a
                      className="export-subtle"
                      href={pdfURL}
                      download={`${story.title.replace(/[<>:"/\\|?*]/g, "_")}.pdf`}
                    >
                      保存 PDF
                    </a>
                  </>
                )}
              </div>
            </section>
            {busy && (
              <div className="story-export-progress">
                <p role="status">{busy}</p>
                {pdfController.current && (
                  <button
                    type="button"
                    onClick={() => pdfController.current?.abort()}
                  >
                    取消制作
                  </button>
                )}
              </div>
            )}
            {notice && (
              <p className="story-export-notice" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="story-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
