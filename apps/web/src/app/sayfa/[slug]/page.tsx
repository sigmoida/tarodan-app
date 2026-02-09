import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import DOMPurify from 'isomorphic-dompurify';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
    const res = await fetch(`${API_BASE}/api/pages/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: 'Sayfa Bulunamadı' };
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
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();

  const sanitizedContent = DOMPurify.sanitize(page.content, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'img', 'blockquote', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <nav className="mb-8 text-sm text-gray-500">
          <Link href="/" className="hover:text-primary-600">
            Ana Sayfa
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{page.title}</span>
        </nav>
        <article className="bg-white rounded-xl shadow-sm overflow-hidden">
          <header className="border-b border-gray-100 px-6 py-8">
            <h1 className="text-3xl font-bold text-gray-900">{page.title}</h1>
          </header>
          <div
            className="prose prose-gray max-w-none px-6 py-8 prose-headings:font-semibold prose-a:text-primary-600 prose-img:rounded-lg"
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </article>
      </div>
    </div>
  );
}
