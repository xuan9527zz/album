import { useEffect, useRef, useState } from "react";
import { Copy, Download, ExternalLink, FileText, Link2, X } from "lucide-react";
import type { Photo } from "../../../packages/shared/src";
import type { ZineConfig, ZineTemplate } from "../../../packages/zine/src";
import { Client, localDemo } from "./client";
import { cachedImage, imageInSession } from "./session-image-cache";

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
  const linkField = useRef<HTMLInputElement>(null);
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
    setBusy("正在准备照片和字体…");
    setError("");
    try {
      const current = await client.request<
        typeof story & { urls: { id: string; url: string }[] }
      >(`/v1/stories/${story.id}`);
      const urls = Object.fromEntries(
        current.urls.map((item) => [item.id, item.url]),
      );
      const { createZinePDF } = await import("./zine-pdf");
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
          if (!asset || !urls[asset.id])
            throw new Error("有照片尚无预览图，请先生成预览后导出");
          return (
            cachedImage(asset.id) ||
            (localDemo
              ? urls[asset.id]
              : await imageInSession(asset.id, urls[asset.id]))
          );
        },
        (page, total) => setBusy(`正在制作 PDF · ${page}/${total} 页`),
      );
      setPDFURL(URL.createObjectURL(blob));
    } catch (e) {
      setError((e as Error).message || "PDF 导出失败，请重试");
    } finally {
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
              <p className="story-export-progress" role="status">
                {busy}
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
