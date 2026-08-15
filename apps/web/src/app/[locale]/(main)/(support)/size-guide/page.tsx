/** @format */

import Image from "next/image";
import type { Metadata } from "next";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { formatTL } from "@/lib/format";
import { localizedCanonical } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { Translate } from "@/types/i18n";

const packageTiers = (t: Translate) =>
  [
    {
      code: "small",
      label: t("information.sizeGuide.kucukPaket"),
      amount: 100,
      dimensions: t("information.sizeGuide.201025Cm"),
    },
    {
      code: "medium",
      label: t("information.sizeGuide.ortaPaket"),
      amount: 130,
      dimensions: t("information.sizeGuide.352045Cm"),
    },
    {
      code: "large",
      label: t("information.sizeGuide.buyukPaket"),
      amount: 160,
      dimensions: t("information.sizeGuide.604070Cm"),
    },
  ] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    title: t("information.sizeGuide.olcekRehberiTarodan"),
    description: t(
      "information.sizeGuide.tarodanKargoPaketBoyutlariPaketUcretleri",
    ),
    alternates: localizedCanonical(locale, "/size-guide"),
  };
}

export default async function SizeGuidePage() {
  const t = await getTranslations();
  return (
    <DocPage
      title={t("information.sizeGuide.olcekRehberi")}
      description={t(
        "information.sizeGuide.ilaninizIcinDogruKargoPaketBoyutunu",
      )}
    >
      <SectionCard title={t("information.sizeGuide.kargoPaketBoyutu")}>
        <p className="mb-3 text-sm text-muted">
          {t("information.sizeGuide.urununuzunSigacagiEnKucukPaketiSecin")}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {packageTiers(t).map((tier) => (
            <article
              key={tier.code}
              className="flex items-center gap-3 rounded-xl border border-border p-3 sm:flex-col sm:items-stretch sm:gap-2 sm:p-4"
            >
              <div className="relative h-14 w-20 shrink-0 sm:h-24 sm:w-full">
                <Image
                  src={`/package-tiers/${tier.code}.webp`}
                  alt={t("information.sizeGuide.labelGorseli", {
                    label: tier.label,
                  })}
                  fill
                  sizes="(max-width: 640px) 80px, 240px"
                  className="object-contain"
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
                <h3 className="truncate text-sm font-semibold text-heading sm:text-center">
                  {tier.label}
                </h3>
                <div className="rounded-lg bg-primary-600 px-3 py-1.5 text-center">
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-inverted/80">
                    {t("information.sizeGuide.paketUcreti")}
                  </span>
                  <span className="block text-base font-bold text-inverted">
                    {formatTL(tier.amount)}
                  </span>
                </div>
                <div className="rounded-lg border border-dashed border-border px-2 py-1 text-center">
                  <span className="block text-[10px] uppercase tracking-wide text-muted">
                    {t("information.sizeGuide.ornekOlcuEnBoyYukseklik")}
                  </span>
                  <span className="block text-xs font-medium text-body">
                    {tier.dimensions}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </DocPage>
  );
}
