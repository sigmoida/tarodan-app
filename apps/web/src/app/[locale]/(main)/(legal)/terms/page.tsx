import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { PageContent } from "@/app/[locale]/(main)/(trash)/sayfa/[slug]/PageContent";
import { getTermsPage } from "./_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getTermsPage();
  if (!page) return { title: "Kullanım Koşulları" };
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
  const page = await getTermsPage();
  if (!page) notFound();

  return (
    <DocPage title={page.title}>
      <SectionCard className="p-0">
        <PageContent content={page.content} />
      </SectionCard>
    </DocPage>
  );
}
