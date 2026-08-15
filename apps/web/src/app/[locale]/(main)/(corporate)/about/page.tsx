/** @format */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localizedCanonical } from "@/lib/seo";
import { PageShell } from "@/components/layout/PageShell";
import {
  aboutLead,
  aboutStory,
  aboutQuestion,
  aboutAnswer,
  aboutClosing,
} from "./_lib/story";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const title = t("information.about.metaTitle");
  const description = t("information.about.metaDescription");
  return {
    title,
    description,
    alternates: localizedCanonical(locale, "/about"),
    openGraph: { title, description },
  };
}

/**
 * Sayfa başlığı ve kart çerçevesi bilinçli olarak yok: anlatı metni, üzerinde
 * "Hakkımızda" etiketi ve kutu olmadan doğrudan sayfa yüzeyinde akıyor.
 */
export default async function AboutPage() {
  const t = await getTranslations();
  return (
    <PageShell className="py-8">
      <article className="mx-auto max-w-2xl space-y-5">
        <p className="text-lg font-medium leading-relaxed text-heading">
          {aboutLead(t)}
        </p>

        {aboutStory(t).map((paragraph) => (
          <p key={paragraph} className="leading-relaxed text-body">
            {paragraph}
          </p>
        ))}

        <p className="border-l-2 border-primary-500 pl-4 text-lg font-medium leading-relaxed text-heading">
          {aboutQuestion(t)}
        </p>

        {aboutAnswer(t).map((paragraph) => (
          <p key={paragraph} className="leading-relaxed text-body">
            {paragraph}
          </p>
        ))}

        <div className="border-t border-border pt-5">
          <p className="text-body">{aboutClosing(t).kicker}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-heading">
            {aboutClosing(t).headline}
          </p>
          <p className="mt-4 leading-relaxed text-body">
            {aboutClosing(t).outro}
          </p>
        </div>
      </article>
    </PageShell>
  );
}
