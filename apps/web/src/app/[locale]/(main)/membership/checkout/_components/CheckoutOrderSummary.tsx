/** @format */

"use client";

import { CheckIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/ui";
import type { TierInfo } from "../_lib/tiers";
import { useTranslations } from "next-intl";

const fmt = (n: number, locale: string) =>
  n.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function CheckoutOrderSummary({
  tierInfo,
  period,
}: {
  tierInfo: TierInfo;
  period: "monthly" | "yearly";
}) {
  const t = useTranslations();
  const finalPrice = tierInfo.price;
  const basePrice = tierInfo.basePrice;
  const yearly = period === "yearly";
  const monthlyPrice = yearly ? Math.round(finalPrice / 12) : finalPrice;
  const normalYear = basePrice * 12;
  const discountPct =
    normalYear > 0 ? Math.round((1 - finalPrice / normalYear) * 100) : 0;

  return (
    <SectionCard
      title={t("membership.orderSummary.siparisOzeti")}
      className="p-6 sticky top-8"
    >
      <div className="border-b border-border pb-4 mb-4">
        <h3 className="font-semibold text-heading">{tierInfo.name}</h3>
        <p className="text-sm text-muted">
          {yearly
            ? t("membership.orderSummary.yillikPlan")
            : t("membership.orderSummary.aylikPlan")}
        </p>
      </div>

      <ul className="space-y-2 mb-6">
        {tierInfo.features.map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-2 text-sm text-muted"
          >
            <CheckIcon className="w-4 h-4 text-success-500 flex-shrink-0" />
            {feature}
          </li>
        ))}
      </ul>

      <div className="border-t border-border pt-4 space-y-2">
        {yearly && (
          <>
            <div className="flex justify-between text-sm text-muted">
              <span>{t("membership.orderSummary.normalFiyat")}</span>
              <span className="line-through">
                {fmt(normalYear, t("common.dateLocale"))} TL
              </span>
            </div>
            <div className="flex justify-between text-sm text-success-600">
              <span>
                {t("membership.orderSummary.discountPercent", {
                  percent: discountPct,
                })}
              </span>
              <span>
                -{fmt(normalYear - finalPrice, t("common.dateLocale"))} TL
              </span>
            </div>
          </>
        )}
        <div className="flex justify-between text-lg font-semibold">
          <span>{t("membership.orderSummary.toplam")}</span>
          <span className="text-primary-500">
            {fmt(finalPrice, t("common.dateLocale"))} TL
          </span>
        </div>
        {yearly && (
          <p className="text-xs text-muted text-right">
            Ayda {fmt(monthlyPrice, t("common.dateLocale"))} TL
          </p>
        )}
      </div>
    </SectionCard>
  );
}
