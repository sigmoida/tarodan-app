import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageContent } from '@/app/sayfa/[slug]/PageContent';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API_BASE}/api/pages/about`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage();
  if (!page) return { title: 'Hakkımızda' };
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

export default async function AboutPage() {
  const page = await getPage();
  if (!page) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <nav className="mb-8 text-sm text-muted">
          <Link href="/" className="hover:text-primary-600">Ana Sayfa</Link>
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
