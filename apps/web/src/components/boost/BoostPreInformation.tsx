/** @format */

"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";

interface BoostPreInformationProps {
  listingTitle: string;
  packageName: string;
  durationDays: number;
  /** The price of the selected duration (VAT included), as the API quotes it. */
  price: number;
}

/**
 * The pre-contract information the seller reads before accepting a boost
 * purchase: provider, service, total price and that the service starts at
 * once and cannot be cancelled. It follows the current selection, so what the
 * seller consents to is what the dialog shows. The provider is the platform's
 * legal entity (`lib/legal/platform-entity`), the one source for every legal
 * text. DRAFT copy until legal signs it off (tarodan-ops plan
 * 2026-10-21-listing-boost, D15).
 */
export default function BoostPreInformation({
  listingTitle,
  packageName,
  durationDays,
  price,
}: BoostPreInformationProps) {
  const t = useTranslations();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-lg border border-border bg-surface-alt p-3 text-sm"
    >
      <h3 id={titleId} className="font-semibold text-heading">
        {t("profile.boost.preInfo.title")}
      </h3>
      <ul className="mt-2 space-y-1 text-body">
        <li>
          {t("profile.boost.preInfo.provider", {
            company: PLATFORM_ENTITY.legalName,
          })}
        </li>
        <li>
          {t("profile.boost.preInfo.service", {
            listing: listingTitle,
            package: packageName,
            days: durationDays,
          })}
        </li>
        <li>
          {t.rich("profile.boost.preInfo.price", {
            price: formatTL(price),
            amount: (chunks) => (
              <span className="font-bold text-primary-600">{chunks}</span>
            ),
          })}
        </li>
        <li>{t("profile.boost.preInfo.start")}</li>
        <li>{t("profile.boost.preInfo.noCancel")}</li>
      </ul>
    </section>
  );
}
