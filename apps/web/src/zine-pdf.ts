import {
  getZineCollection,
  getZineLayout,
  resolveZineText,
} from "../../../packages/zine/src/model";
import { contrastInk } from "../../../packages/zine/src/color";
import { zineFontFamilies } from "../../../packages/zine/src/ZineFonts";
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
function image(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("有照片未能加载，请联网后重试导出"));
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
    );
    ctx.restore();
    return;
  }
  const family = `${zineFontFamilies[node.font || "Inter"]},${node.font === "Inter" ? "ZineHanSans,sans-serif" : "ZineHanSerif,serif"}`;
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
) {
  const { jsPDF } = await import("jspdf");
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
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 960;
  const ctx = canvas.getContext("2d")!;
  for (const [index, page] of story.zine_config.pages.entries()) {
    progress(index + 1, story.zine_config.pages.length);
    const layout = getZineLayout(page.layout)!;
    for (const node of layout.nodes)
      if (node.type === "text" && node.binding) {
        const text = resolveZineText(
          node.binding,
          page,
          lookup,
          story.title,
          index,
        );
        if (text)
          await document.fonts.load(
            `${node.italic ? "italic " : ""}${node.weight || 400} ${node.size || 16}px ${zineFontFamilies[node.font || "Inter"]}`,
            text,
          );
        if (/[\u2e80-\u9fff]/.test(text))
          await document.fonts.load(
            `400 ${node.size || 16}px ${node.font === "Inter" ? "ZineHanSans" : "ZineHanSerif"}`,
            text,
          );
      }
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
        );
      else if (node.type === "photo") {
        const photo = lookup.get(page.photo_ids[node.slot || 0] || "");
        if (photo) {
          const img = await image(await getSource(photo));
          const scale = Math.max(
            node.w / img.naturalWidth,
            node.h / img.naturalHeight,
          );
          const position = (node.position || "50% 50%")
            .split(" ")
            .map((part) => parseFloat(part) / 100);
          ctx.beginPath();
          ctx.rect(node.x, node.y, node.w, node.h);
          ctx.clip();
          ctx.drawImage(
            img,
            node.x - (img.naturalWidth * scale - node.w) * (position[0] || 0.5),
            node.y -
              (img.naturalHeight * scale - node.h) * (position[1] || 0.5),
            img.naturalWidth * scale,
            img.naturalHeight * scale,
          );
        } else {
          ctx.fillStyle = "#e1e5dd";
          ctx.fillRect(node.x, node.y, node.w, node.h);
        }
      }
      ctx.restore();
    }
    if (index) pdf.addPage([1440, 960], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 1440, 960);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  canvas.width = canvas.height = 0;
  return pdf.output("blob");
}
