/** @format */

"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { MyBoostRow } from "@tarodan/types";
import { formatDate, formatTL } from "@/lib/format";

/**
 * What one boost row was: package, days, showcase, when it was bought and the
 * period it runs, and the price (a free grant shows the grant badge instead).
 * `note` is the row's own line under the dates (stacked boosts say how long
 * they add).
 */
export default function BoostPurchase({
  row,
  refunded = false,
  note,
}: {
  row: MyBoostRow;
  /** Strike the price: the money went back (history rows). */
  refunded?: boolean;
  note?: ReactNode;
}) {
  const t = useTranslations();
  const grant = row.source === "admin_grant";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-heading">
          {row.packageName ? `${row.packageName} · ` : ""}
          {t("profile.boost.daysValue", { days: row.durationDays })}
        </p>
        {row.showcaseOnHome && (
          <p className="text-xs text-muted">
            {t("profile.boost.showcaseHint")}
          </p>
        )}
        <p className="text-xs text-subtle">
          {t("profile.boosts.purchasedAt", { date: formatDate(row.createdAt) })}
          {row.startsAt && row.endsAt && (
            <>
              {" · "}
              {t("profile.boosts.period", {
                start: formatDate(row.startsAt),
                end: formatDate(row.endsAt),
              })}
            </>
          )}
        </p>
        {note}
      </div>
      <div className="shrink-0 text-right">
        {grant ? (
          <Badge variant="default" size="sm">
            {t("profile.boosts.source.adminGrant")}
          </Badge>
        ) : (
          <span
            className={`font-semibold ${
              refunded ? "text-subtle line-through" : "text-heading"
            }`}
          >
            {formatTL(row.price)}
          </span>
        )}
      </div>
    </div>
  );
}
