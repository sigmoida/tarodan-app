/** @format */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LegalDocContent, legalDocMeta } from "@/components/legal/documents";
import { EMBED_DOCS, isEmbedDoc } from "@/lib/embed";
import { routing } from "@/i18n/routing";

type Params = Promise<{ locale: string; doc: string }>;

/** Listede olmayan belge 404 olur (isteğe bağlı üretim yok). */
export const dynamicParams = false;

/** 6 belge × her locale, derleme anında statik. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    EMBED_DOCS.map((doc) => ({ locale, doc })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isEmbedDoc(doc)) return {};
  // noindex yalnız (embed)/layout.tsx'te (tek yer).
  return legalDocMeta(doc, locale);
}

/**
 * Mobil WebView için yasal belge: içerik `LEGAL_DOCS` kaydından gelir (normal
 * site sayfalarıyla aynı kaynak). Yol: `/app/<doc>` (tr), `/en/app/<doc>` (en).
 */
export default async function EmbedDocPage({ params }: { params: Params }) {
  const { locale, doc } = await params;
  if (!isEmbedDoc(doc)) notFound();
  setRequestLocale(locale);
  return <LegalDocContent doc={doc} embed />;
}
