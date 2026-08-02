/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import { PageShell } from "@/components/layout/PageShell";
import {
  ABOUT_LEAD,
  ABOUT_STORY,
  ABOUT_QUESTION,
  ABOUT_ANSWER,
  ABOUT_CLOSING,
} from "./_lib/story";

const DESCRIPTION =
  "Tarodan, diecast koleksiyonerlerinin dijital garajı: koleksiyonunu sergileyebileceğin, güvenle alışveriş ve takas yapabileceğin koleksiyoner topluluğu.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Hakkımızda · Tarodan",
    description: DESCRIPTION,
    alternates: localizedCanonical(locale, "/about"),
    openGraph: { title: "Hakkımızda · Tarodan", description: DESCRIPTION },
  };
}

/**
 * Sayfa başlığı ve kart çerçevesi bilinçli olarak yok: anlatı metni, üzerinde
 * "Hakkımızda" etiketi ve kutu olmadan doğrudan sayfa yüzeyinde akıyor.
 */
export default function AboutPage() {
  return (
    <PageShell className="py-8">
      <article className="mx-auto max-w-2xl space-y-5">
        <p className="text-lg font-medium leading-relaxed text-heading">
          {ABOUT_LEAD}
        </p>

        {ABOUT_STORY.map((paragraph) => (
          <p key={paragraph} className="leading-relaxed text-body">
            {paragraph}
          </p>
        ))}

        <p className="border-l-2 border-primary-500 pl-4 text-lg font-medium leading-relaxed text-heading">
          {ABOUT_QUESTION}
        </p>

        {ABOUT_ANSWER.map((paragraph) => (
          <p key={paragraph} className="leading-relaxed text-body">
            {paragraph}
          </p>
        ))}

        <div className="border-t border-border pt-5">
          <p className="text-body">{ABOUT_CLOSING.kicker}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-heading">
            {ABOUT_CLOSING.headline}
          </p>
          <p className="mt-4 leading-relaxed text-body">
            {ABOUT_CLOSING.outro}
          </p>
        </div>
      </article>
    </PageShell>
  );
}
