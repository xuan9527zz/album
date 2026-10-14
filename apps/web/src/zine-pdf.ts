import {
  getZineCollection,
  getZineLayout,
  resolveZineText,
} from "../../../packages/zine/src/model";
import { contrastInk } from "../../../packages/zine/src/color";
import { zineFontFamilies } from "../../../packages/zine/src/ZineFonts";
import { pdfTask } from "./pdf-task";
import { cropGeometry } from "../../../packages/zine/src/crop";
import type {
  ZineConfig,
  ZineNode,
  ZinePhoto,
  ZineTemplate,
} from "../../../packages/zine/src/types";

type PDFStory = {
  title: string;
  template: ZineTemplate;
  zine_config: ZineConfig;
  photos: ZinePhoto[];
};
function image(source: string, signal?: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const clear = () => {
      img.onload = img.onerror = null;
      signal?.removeEventListener("abort", abort);
      window.clearTimeout(timer);
    };
    const abort = () => {
      clear();
      img.src = "";
      reject(new DOMException("已取消制作 PDF", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      clear();
      img.src = "";
      reject(new Error("照片加载超时，请检查网络后重试导出"));
    }, 30000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clear();
      resolve(img);
    };
    img.onerror = () => {
      clear();
      reject(new Error("有照片未能加载，请联网后重试导出"));
    };
    img.src = source;
  });
}
function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const ch of Array.from(paragraph)) {
      if (line && ctx.measureText(line + ch).width > width) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}
function drawText(
  ctx: CanvasRenderingContext2D,
  node: ZineNode,
  text: string,
  ink: string,
  fontFamily: (node: ZineNode) => string,
) {
  if (
    node.vertical &&
    !["HanSerif", "Huiwen"].includes(node.font || "") &&
    /^[\x00-\x7F]*$/.test(text)
  ) {
    ctx.save();
    ctx.translate(node.x + node.w, node.y);
    ctx.rotate(Math.PI / 2);
    drawText(
      ctx,
      { ...node, x: 0, y: 0, w: node.h, h: node.w, vertical: false },
      text,
      ink,
      fontFamily,
    );
    ctx.restore();
    return;
  }
  const family = fontFamily(node);
  const setFont = (size: number) => {
    ctx.font = `${node.italic ? "italic " : ""}${node.weight || 400} ${size}px ${family}`;
  };
  const chars = Array.from(text.replace(/\n/g, ""));
  const fits = (size: number) => {
    setFont(size);
    const height = size * (node.lineHeight || 1.25);
    return node.vertical
      ? Math.ceil(chars.length / Math.max(1, Math.floor(node.h / height))) *
          height <=
          node.w
      : linesFor(ctx, text, node.w).length * height <= node.h;
  };
  let low = Math.min(node.size || 16, 14),
    high = node.size || 16;
  if (!fits(high))
    for (let i = 0; i < 9; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) low = mid;
      else high = mid;
    }
  else low = high;
  setFont(low);
  ctx.fillStyle = node.color || ink;
  ctx.textBaseline = "top";
  const lineHeight = low * (node.lineHeight || 1.25);
  ctx.save();
  ctx.beginPath();
  ctx.rect(node.x, node.y, node.w, node.h);
  ctx.clip();
  if (node.vertical) {
    const rows = Math.max(1, Math.floor(node.h / lineHeight)),
      cols = Math.max(1, Math.floor(node.w / lineHeight));
    const visible = chars.slice(0, rows * cols);
    if (visible.length < chars.length) visible[visible.length - 1] = "…";
    ctx.textAlign = "center";
    visible.forEach((ch, i) =>
      ctx.fillText(
        ch,
        node.x + node.w - lineHeight * (Math.floor(i / rows) + 0.5),
        node.y + (i % rows) * lineHeight,
      ),
    );
  } else {
    const lines = linesFor(ctx, text, node.w),
      count = Math.max(1, Math.floor(node.h / lineHeight));
    const visible = lines.slice(0, count);
    if (lines.length > count) {
      let last = visible[count - 1];
      while (last && ctx.measureText(last + "…").width > node.w)
        last = last.slice(0, -1);
      visible[count - 1] = last + "…";
    }
    ctx.textAlign = node.align || "left";
    const x =
      node.x +
      (node.align === "center"
        ? node.w / 2
        : node.align === "right"
          ? node.w
          : 0);
    visible.forEach((line, i) =>
      ctx.fillText(
        line,
        x,
        node.y + i * lineHeight + Math.max(0, (lineHeight - low) / 2),
      ),
    );
  }
  ctx.restore();
}
export async function createZinePDF(
  story: PDFStory,
  getSource: (photo: ZinePhoto) => Promise<string>,
  progress: (page: number, total: number) => void,
  options: {
    signal?: AbortSignal;
    stage?: (message: string) => void;
    warning?: (message: string) => void;
  } = {},
) {
  const { signal } = options;
  options.stage?.("正在载入 PDF 工具…");
  const { jsPDF } = await pdfTask(
    () => import("jspdf"),
    signal,
    "PDF 工具加载超时，请联网后重试",
  );
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [1440, 960],
    compress: true,
    hotfixes: ["px_scaling"],
  });
  pdf.setProperties({ title: story.title, creator: "唯味相册" });
  const collection = getZineCollection(story.template),
    lookup = new Map(story.photos.map((p) => [p.id, p]));
  const background = story.zine_config.background_color || collection.paper;
  const ink = story.zine_config.background_color
    ? contrastInk(background)
    : collection.ink;
  options.stage?.("正在准备影集字体…");
  const fonts = new Map<string, Set<string>>();
  const descriptor = (node: ZineNode) =>
    `${node.italic ? "italic " : ""}${node.weight || 400} 16px ${zineFontFamilies[node.font || "Inter"]}`;
  const requireFont = (font: string, text: string) => {
    const chars = fonts.get(font) || new Set<string>();
    for (const ch of text) chars.add(ch);
    fonts.set(font, chars);
  };
  for (const [index, page] of story.zine_config.pages.entries()) {
    const layout = getZineLayout(page.layout);
    if (!layout) throw new Error("影集版式不可用，请重新选择模板后保存");
    for (const node of layout.nodes)
      if (node.type === "text" && node.binding) {
        const text = resolveZineText(
          node.binding,
          page,
          lookup,
          story.title,
          index,
        );
        if (!text) continue;
        requireFont(descriptor(node), text);
        if (/[\u2e80-\u9fff]/.test(text))
          requireFont(
            `400 16px ${node.font === "Inter" ? "ZineHanSans" : "ZineHanSerif"}`,
            text,
          );
      }
  }
  const loadedFonts = new Set<string>();
  await Promise.all(
    [...fonts].map(async ([font, chars]) => {
      try {
        const faces = await pdfTask(
          () => document.fonts.load(font, [...chars].join("")),
          signal,
          "字体加载超时",
          12000,
        );
        if (faces.length) loadedFonts.add(font);
      } catch (error) {
        if (signal?.aborted) throw error;
        // Font requests cannot be cancelled. Use a fixed fallback for this PDF
        // so a late font response cannot change its layout midway through export.
      }
    }),
  );
  if (loadedFonts.size < fonts.size)
    options.warning?.(
      "部分影集字体未能载入，本次 PDF 使用系统字体。可联网后重新制作以保留模板字体。",
    );
  const fontFamily = (node: ZineNode) => {
    const sans = node.font === "Inter" || node.font === "HanSans";
    const fallback = sans ? "ZineHanSans" : "ZineHanSerif";
    return [
      loadedFonts.has(descriptor(node))
        ? zineFontFamilies[node.font || "Inter"]
        : "",
      loadedFonts.has(`400 16px ${fallback}`) ? fallback : "",
      sans ? "sans-serif" : "serif",
    ]
      .filter(Boolean)
      .join(",");
  };
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前设备无法创建 PDF 画布，请关闭其他页面后重试");
  try {
    for (const [index, page] of story.zine_config.pages.entries()) {
      if (signal?.aborted)
        throw new DOMException("已取消制作 PDF", "AbortError");
      progress(index + 1, story.zine_config.pages.length);
      const layout = getZineLayout(page.layout)!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 1440, 960);
      for (const raw of layout.nodes) {
        const node = {
          ...raw,
          color:
            raw.color?.toLowerCase() === collection.ink.toLowerCase()
              ? ink
              : raw.color,
        };
        ctx.save();
        ctx.globalAlpha = node.opacity ?? 1;
        if (node.type === "block") {
          ctx.fillStyle =
            node.color?.toLowerCase() === collection.paper.toLowerCase()
              ? background
              : node.color || ink;
          ctx.fillRect(node.x, node.y, node.w, node.h);
        } else if (node.type === "text" && node.binding)
          drawText(
            ctx,
            node,
            resolveZineText(node.binding, page, lookup, story.title, index),
            ink,
            fontFamily,
          );
        else if (node.type === "photo") {
          const photo = lookup.get(page.photo_ids[node.slot || 0] || "");
          if (photo) {
            const source = await pdfTask(
              () => getSource(photo),
              signal,
              `第 ${index + 1} 页照片下载超时，请检查网络后重试`,
            );
            const img = await image(source, signal);
            const crop = cropGeometry(img.naturalWidth, img.naturalHeight, node.w, node.h, page.photo_crops?.[node.slot || 0], node.position);
            ctx.beginPath();
            ctx.rect(node.x, node.y, node.w, node.h);
            ctx.clip();
            ctx.drawImage(
              img,
              node.x + crop.left,
              node.y + crop.top,
              crop.width,
              crop.height,
            );
            img.src = "";
          } else {
            ctx.fillStyle = "#e1e5dd";
            ctx.fillRect(node.x, node.y, node.w, node.h);
          }
        }
        ctx.restore();
      }
      if (index) pdf.addPage([1440, 960], "landscape");
      const jpeg = await pdfTask(
        () =>
          new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (blob) =>
                blob
                  ? resolve(blob)
                  : reject(new Error("PDF 页面生成失败，请关闭其他页面后重试")),
              "image/jpeg",
              0.92,
            ),
          ),
        signal,
        "PDF 页面生成超时，请重试",
      );
      pdf.addImage(
        new Uint8Array(await jpeg.arrayBuffer()),
        "JPEG",
        0,
        0,
        1440,
        960,
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    if (signal?.aborted)
      throw new DOMException("已取消制作 PDF", "AbortError");
    return pdf.output("blob");
  } finally {
    canvas.width = canvas.height = 0;
  }
}
