/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { FAQ_SECTIONS } from "./_lib/data";

const DESCRIPTION =
  "Tarodan sıkça sorulan sorular: sipariş oluşturma, ödeme ve güvenli havuz, kargo takibi, takas süreci, iade koşulları ve ilan öne çıkarma paketleri.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Sıkça Sorulan Sorular · Tarodan",
    description: DESCRIPTION,
    alternates: localizedCanonical(locale, "/faq"),
    openGraph: {
      title: "Sıkça Sorulan Sorular · Tarodan",
      description: DESCRIPTION,
    },
  };
}

export default function FAQPage() {
  return (
    <DocPage title="Sıkça Sorulan Sorular">
      {FAQ_SECTIONS.map((section) => (
        <div key={section.id} id={section.id} className="scroll-mt-24">
          <SectionCard title={section.title}>
            <div className="space-y-7">
              {section.entries.map((entry) => (
                <section key={entry.q}>
                  <h3 className="mb-2 font-semibold text-heading">{entry.q}</h3>
                  {entry.a.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mt-2 text-sm leading-relaxed text-body first:mt-0"
                    >
                      {paragraph}
                    </p>
                  ))}
                  {entry.bullets && (
                    <ul className="mt-3 space-y-2">
                      {entry.bullets.map((bullet) => (
                        <li
                          key={`${bullet.label ?? ""}${bullet.text}`}
                          className="border-l-2 border-border pl-3 text-sm leading-relaxed text-body"
                        >
                          {bullet.label && (
                            <strong className="font-medium text-heading">
                              {bullet.label}
                              {": "}
                            </strong>
                          )}
                          {bullet.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </SectionCard>
        </div>
      ))}
    </DocPage>
  );
}
