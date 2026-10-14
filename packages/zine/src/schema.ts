import { z } from "zod";
import { zineLayoutIds } from "./types";
import { getZineCollection, getZineLayout, isZineTemplate } from "./model";
import { musicInputSchema } from "./music";

export const zineConfigSchema = z
  .object({
    version: z.literal(1),
    background_color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    pages: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            layout: z.enum(zineLayoutIds),
            photo_ids: z.array(z.string().uuid().nullable()).min(1).max(3),
            texts: z.record(z.string().max(50), z.string().max(600)),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict()
  .superRefine((config, context) => {
    if (new Set(config.pages.map((p) => p.id)).size !== config.pages.length)
      context.addIssue({ code: "custom", message: "版面编号不能重复" });
    config.pages.forEach((page, i) => {
      const layout = getZineLayout(page.layout)!;
      if (
        page.photo_ids.length !== layout.slots ||
        !page.photo_ids.some(Boolean) ||
        new Set(page.photo_ids.filter(Boolean)).size !==
          page.photo_ids.filter(Boolean).length
      )
        context.addIssue({
          code: "custom",
          path: ["pages", i, "photo_ids"],
          message: "照片位置不符合版式",
        });
      for (const [key, value] of Object.entries(page.texts)) {
        const field = layout.fields.find((f) => f.key === key);
        if (!field || value.length > field.maxLength)
          context.addIssue({
            code: "custom",
            path: ["pages", i, "texts", key],
            message: "文字不符合该版面的输入要求",
          });
      }
    });
  });
export const storyBodySchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    template: z.enum(["zine-city", "zine-diary", "zine-coast"]),
    transition: z.enum(["slide", "fade", "zoom"]),
    is_shared: z.boolean(),
    photo_ids: z.array(z.string().uuid()).min(2).max(60),
    zine_config: zineConfigSchema.nullable().optional(),
    music: musicInputSchema.nullable().optional(),
  })
  .strict()
  .superRefine((story, context) => {
    if (new Set(story.photo_ids).size !== story.photo_ids.length)
      context.addIssue({ code: "custom", message: "照片不能重复" });
    if (!isZineTemplate(story.template)) {
      if (story.zine_config)
        context.addIssue({ code: "custom", message: "请选择 Zine 模板" });
      return;
    }
    if (!story.zine_config) {
      context.addIssue({ code: "custom", message: "缺少影集版面" });
      return;
    }
    const layouts = new Set(
      getZineCollection(story.template).spreads.map((p) => p.id),
    );
    const ids = new Set(story.photo_ids);
    story.zine_config.pages.forEach((page, i) => {
      if (!layouts.has(page.layout))
        context.addIssue({
          code: "custom",
          path: ["zine_config", "pages", i],
          message: "版式属于另一套模板",
        });
      if (page.photo_ids.some((id) => id && !ids.has(id)))
        context.addIssue({
          code: "custom",
          path: ["zine_config", "pages", i],
          message: "版面引用了未选择的照片",
        });
    });
    const used = new Set(
      story.zine_config.pages.flatMap((p) => p.photo_ids).filter(Boolean),
    );
    if (story.photo_ids.some((id) => !used.has(id)))
      context.addIssue({
        code: "custom",
        message: "每张所选照片都需要安排到一个版面",
      });
  });
