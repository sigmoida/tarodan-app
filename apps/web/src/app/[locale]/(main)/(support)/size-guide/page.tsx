/** @format */

import Image from "next/image";
import type { Metadata } from "next";
import { DocPage } from "@/components/layout/DocPage";
import SectionCard from "@/components/ui/SectionCard";
import { formatTL } from "@/lib/format";
import { localizedCanonical } from "@/lib/seo";

const PACKAGE_TIERS = [
  {
    code: "small",
    label: "Küçük Paket",
    amount: 100,
    dimensions: "20 × 10 × 25 cm",
  },
  {
    code: "medium",
    label: "Orta Paket",
    amount: 130,
    dimensions: "35 × 20 × 45 cm",
  },
  {
    code: "large",
    label: "Büyük Paket",
    amount: 160,
    dimensions: "60 × 40 × 70 cm",
  },
] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Ölçek Rehberi · Tarodan",
    description:
      "Tarodan kargo paket boyutları, paket ücretleri ve örnek ölçüleri.",
    alternates: localizedCanonical(locale, "/size-guide"),
  };
}

export default function SizeGuidePage() {
  return (
    <DocPage
      title="Ölçek Rehberi"
      description="İlanınız için doğru kargo paket boyutunu belirlemenize yardımcı olacak bilgilendirme rehberi."
    >
      <SectionCard title="Kargo paket boyutu">
        <p className="mb-3 text-sm text-muted">
          Ürününüzün sığacağı en küçük paketi seçin. Kargo bedeli bu seçime göre
          hesaplanır.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {PACKAGE_TIERS.map((tier) => (
            <article
              key={tier.code}
              className="flex items-center gap-3 rounded-xl border border-border p-3 sm:flex-col sm:items-stretch sm:gap-2 sm:p-4"
            >
              <div className="relative h-14 w-20 shrink-0 sm:h-24 sm:w-full">
                <Image
                  src={`/package-tiers/${tier.code}.webp`}
                  alt={`${tier.label} görseli`}
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
                    Paket ücreti
                  </span>
                  <span className="block text-base font-bold text-inverted">
                    {formatTL(tier.amount)}
                  </span>
                </div>
                <div className="rounded-lg border border-dashed border-border px-2 py-1 text-center">
                  <span className="block text-[10px] uppercase tracking-wide text-muted">
                    Örnek ölçü (en × boy × yükseklik)
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
