/** @format */

import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";
import type { Translate } from "@/types/i18n";
import { getTranslations } from "next-intl/server";

const PERKS = (t: Translate) => [
  t("profile.analyticsUpsell.detayliSatisTahminleri"),
  t("profile.analyticsUpsell.rakipAnalizi"),
  t("profile.analyticsUpsell.pdfExcelRaporIndirme"),
];

/**
 * Premium olmayan kullanıcıya gösterilen yükseltme kartı.
 *
 * Ekranın geri kalanı sade kart yüzeyleri kullanıyor; bu blok tam genişlikte
 * turuncu gradient + ikonlarla duruyordu ve sayfadaki tek "reklam" gibi
 * görünüyordu. Aynı bilgi standart kart yüzeyinde, ikonsuz veriliyor.
 */
export default async function PremiumUpsell() {
  const t = await getTranslations();
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="max-w-xl">
          <h3 className="text-lg font-semibold text-heading">
            {t("profile.analyticsUpsell.premiumAposAYukseltin")}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {t(
              "profile.analyticsUpsell.dahaDetayliAnalizlerGelismisGrafiklerVe",
            )}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-body">
            {PERKS(t).map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </div>
        <Button asChild variant="primary" className="whitespace-nowrap">
          <Link href="/membership">
            {t("profile.analyticsUpsell.premiumAposAGec")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
