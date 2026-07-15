/** @format */

import { Link } from "@/i18n/navigation";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";

const PERKS = [
  "Detaylı satış tahminleri",
  "Rakip analizi",
  "PDF/Excel rapor indirme",
];

/** Shown to non-premium users. */
export default function PremiumUpsell() {
  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-primary-500 via-primary-600 to-warning-500 p-8 text-inverted">
      <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-surface-elevated/20 p-3 backdrop-blur-sm">
            <SparklesIcon className="h-8 w-8" />
          </div>
          <div>
            <h3 className="mb-2 text-xl font-bold">Premium&apos;a Yükseltin</h3>
            <p className="max-w-md text-primary-100">
              Daha detaylı analizler, gelişmiş grafikler ve kişiselleştirilmiş
              öneriler için Premium üyeliğe geçin.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-primary-100">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-center gap-2">
                  <StarSolidIcon className="h-4 w-4 text-warning-300" />
                  {perk}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Button asChild variant="secondary" className="gap-2 whitespace-nowrap">
          <Link href="/membership">
            <SparklesIcon className="h-5 w-5" />
            Premium&apos;a Geç
          </Link>
        </Button>
      </div>
    </div>
  );
}
