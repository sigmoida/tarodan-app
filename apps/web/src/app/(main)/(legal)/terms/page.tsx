import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DocPage } from '@/components/layout/DocPage';
import SectionCard from '@/components/ui/SectionCard';
import { PageContent } from '@/app/(main)/(trash)/sayfa/[slug]/PageContent';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getPage() {
  try {
    const res = await fetch(`${API_BASE}/api/pages/terms`, {
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
  if (!page) return { title: 'Kullanım Koşulları' };
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

export default async function TermsPage() {
  const page = await getPage();
  if (!page) notFound();

  return (
    <DocPage title={page.title}>
      <SectionCard className="p-0">
        <PageContent content={page.content} />
      </SectionCard>
    </DocPage>
  );
}
