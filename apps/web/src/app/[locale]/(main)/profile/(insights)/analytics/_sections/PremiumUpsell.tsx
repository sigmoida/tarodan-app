/** @format */

import { Link } from "@/i18n/navigation";
import { Button } from "@tarodan/ui";

const PERKS = [
  "Detaylı satış tahminleri",
  "Rakip analizi",
  "PDF/Excel rapor indirme",
];

/**
 * Premium olmayan kullanıcıya gösterilen yükseltme kartı.
 *
 * Ekranın geri kalanı sade kart yüzeyleri kullanıyor; bu blok tam genişlikte
 * turuncu gradient + ikonlarla duruyordu ve sayfadaki tek "reklam" gibi
 * görünüyordu. Aynı bilgi standart kart yüzeyinde, ikonsuz veriliyor.
 */
export default function PremiumUpsell() {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="max-w-xl">
          <h3 className="text-lg font-semibold text-heading">
            Premium&apos;a Yükseltin
          </h3>
          <p className="mt-1 text-sm text-muted">
            Daha detaylı analizler, gelişmiş grafikler ve kişiselleştirilmiş
            öneriler için Premium üyeliğe geçin.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-body">
            {PERKS.map((perk) => (
              <li key={perk}>{perk}</li>
            ))}
          </ul>
        </div>
        <Button asChild variant="primary" className="whitespace-nowrap">
          <Link href="/membership">Premium&apos;a Geç</Link>
        </Button>
      </div>
    </div>
  );
}
