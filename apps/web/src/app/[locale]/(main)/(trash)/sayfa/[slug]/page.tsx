import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageContent } from "./PageContent";

import { getServerApiOrigin } from "@/lib/api/origin";
import { getTranslations } from "next-intl/server";

const API_BASE = getServerApiOrigin();

interface StaticPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  updatedAt: string;
}

async function getPage(slug: string): Promise<StaticPage | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/pages/${encodeURIComponent(slug)}`,
      {
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations();
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: t("page.sayfa.page.sayfaBulunamadi") };
  return {
    title: page.metaTitle || page.title,
    description: page.metaDescription || undefined,
    keywords: page.metaKeywords || undefined,
    openGraph: {
      title: page.metaTitle || page.title,
      description: page.metaDescription || undefined,
    },
  };
}

export default async function StaticPageRoute({ params }: Props) {
  const t = await getTranslations();
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  return (
    <div className="min-h-dvh bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">
            {t("page.sayfa.page.anaSayfa")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-heading">{page.title}</span>
        </nav>
        <article className="bg-surface-elevated rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-border-subtle px-6 py-8">
            <h1 className="text-3xl font-bold text-heading">{page.title}</h1>
          </header>
          <PageContent content={page.content} />
        </article>
      </div>
    </div>
  );
}
