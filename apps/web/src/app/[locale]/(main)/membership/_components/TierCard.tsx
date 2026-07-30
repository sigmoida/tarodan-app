/** @format */

"use client";

import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Badge, Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import { displayPrice } from "../_lib/tiers";
import type { Period, Tier, TierPrices } from "../_lib/types";

/**
 * Tek plan kartı. Sadeleştirilmiş sürüm: tek vurgu rengi (seçili kenarlık),
 * geri kalan her şey nötr. Eskiden kart aynı anda halka + renkli rozet + yeşil
 * tikler + mavi "mevcut plan" etiketi taşıyordu; dört farklı renk hangi bilginin
 * önemli olduğunu belirsizleştiriyordu.
 */
export default function TierCard({
  tier,
  period,
  prices,
  isSelected,
  isCurrent,
  isExactCurrent,
  disabled,
  onSelect,
}: {
  tier: Tier;
  period: Period;
  prices: TierPrices;
  isSelected: boolean;
  isCurrent: boolean;
  isExactCurrent: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  const price = displayPrice(tier, period, prices);

  const ctaLabel = isExactCurrent
    ? t("membership.currentPlan")
    : tier.price === 0
      ? t("membership.free")
      : t("common.continue");

  // Tek rozet yuvası, öncelik sırası: seçili > mevcut > popüler.
  const badge = isSelected
    ? t("common.selected")
    : isCurrent
      ? t("membership.currentPlan")
      : tier.popular
        ? t("membership.mostPopular")
        : null;

  return (
    <div
      id={`tier-${tier.id}`}
      onClick={disabled ? undefined : onSelect}
      className={`flex flex-col rounded-lg border bg-surface-elevated p-6 transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-border-strong"
      } ${isSelected ? "border-primary-500" : "border-border"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-heading">{tier.name}</h3>
        {badge && (
          <Badge variant="default" size="sm" className="flex-shrink-0">
            {badge}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">{tier.description}</p>

      <div className="mt-5">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-semibold text-heading">
            {tier.price === 0 ? "Ücretsiz" : formatTL(price)}
          </span>
          {tier.price > 0 && (
            <span className="text-sm text-muted">
              /{period === "yearly" ? "yıl" : "ay"}
            </span>
          )}
        </div>
      </div>

      <ul className="mt-5 flex-1 space-y-2.5 border-t border-border-subtle pt-5">
        {tier.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2.5">
            {feature.included ? (
              <CheckIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-heading" />
            ) : (
              <XMarkIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-subtle" />
            )}
            <span
              className={`text-sm ${feature.included ? "text-body" : "text-subtle"}`}
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      <Button
        variant={isExactCurrent || tier.price === 0 ? "outline" : "primary"}
        disabled={disabled}
        onClick={
          disabled
            ? undefined
            : (e) => {
                e.stopPropagation();
                onSelect();
              }
        }
        className="mt-6 w-full"
      >
        {ctaLabel}
      </Button>
    </div>
  );
}
