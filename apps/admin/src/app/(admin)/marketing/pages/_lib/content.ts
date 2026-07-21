import { z } from "zod";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Shared list key used by the page and editor invalidation. */
export const PAGES_QUERY_KEY = ["pages"] as const;

export const predefinedPages = (t: T) =>
  [
    {
      slug: "about",
      title: t("admin.marketing.pages.predefined.about.title"),
      url: "/about",
      description: t("admin.marketing.pages.predefined.about.description"),
    },
    {
      slug: "faq",
      title: t("admin.marketing.pages.predefined.faq.title"),
      url: "/faq",
      description: t("admin.marketing.pages.predefined.faq.description"),
    },
    {
      slug: "privacy",
      title: t("admin.marketing.pages.predefined.privacy.title"),
      url: "/privacy",
      description: t("admin.marketing.pages.predefined.privacy.description"),
    },
    {
      slug: "terms",
      title: t("admin.marketing.pages.predefined.terms.title"),
      url: "/terms",
      description: t("admin.marketing.pages.predefined.terms.description"),
    },
  ] as const;

export type PredefinedSlug = "about" | "faq" | "privacy" | "terms";

export const defaultContent = (
  t: T,
): Record<PredefinedSlug, { title: string; content: string }> => ({
  about: {
    title: t("admin.marketing.pages.predefined.about.title"),
    content: t.raw("admin.marketing.pages.defaultContent.about"),
  },
  faq: {
    title: t("admin.marketing.pages.predefined.faq.title"),
    content: t.raw("admin.marketing.pages.defaultContent.faq"),
  },
  privacy: {
    title: t("admin.marketing.pages.predefined.privacy.title"),
    content: t.raw("admin.marketing.pages.defaultContent.privacy"),
  },
  terms: {
    title: t("admin.marketing.pages.predefined.terms.title"),
    content: t.raw("admin.marketing.pages.defaultContent.terms"),
  },
});

/** Sandboxed preview document (plain CSS — not Tailwind). */
export function buildPreviewDoc(
  html: string,
  emptyMessage: string,
  lang: string,
): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px 32px; color: #1a1a1a; background: #fff; line-height: 1.65; font-size: 15px; }
  h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.5em; }
  h2 { font-size: 1.25rem; font-weight: 700; margin: 1.75em 0 0.5em; color: #111; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.35em; }
  h3 { font-size: 1.05rem; font-weight: 600; margin: 1.25em 0 0.35em; color: #222; }
  p { margin: 0 0 1em; color: #374151; }
  ul, ol { padding-left: 1.5em; margin: 0 0 1em; }
  li { margin-bottom: 0.35em; color: #374151; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 600; }
  em { font-style: italic; color: #6b7280; }
  code { background: #f3f4f6; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.875em; font-family: monospace; }
  blockquote { border-left: 3px solid #d1d5db; margin: 0 0 1em; padding: 0.5em 1em; color: #6b7280; }
  img { max-width: 100%; border-radius: 8px; }
</style>
</head>
<body>${html || `<p style="color:#9ca3af;font-style:italic;">${emptyMessage}</p>`}</body>
</html>`;
}

export interface StaticPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  isPublished: boolean;
  sortOrder: number;
}

export const pageEditorSchema = (t: T) =>
  z.object({
    title: z
      .string()
      .trim()
      .min(1, t("admin.marketing.pages.validation.titleRequired")),
    content: z
      .string()
      .trim()
      .min(1, t("admin.marketing.pages.validation.contentRequired")),
    metaTitle: z.string(),
    metaDescription: z.string(),
    metaKeywords: z.string(),
    isPublished: z.boolean(),
  });

export type EditorForm = z.infer<ReturnType<typeof pageEditorSchema>>;
