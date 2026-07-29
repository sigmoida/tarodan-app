"use client";

import { useTranslations } from "next-intl";
import {
  AsyncValue,
  Button,
  enumLabel,
  membershipTierConfig,
} from "@tarodan/ui";
import { PencilIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { type MembershipTier, computedYearly } from "../_lib/types";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-heading">{value}</span>
    </div>
  );
}

const featurePill = "rounded px-2 py-1 text-xs";

export function TierCard({
  tier,
  yearlyDiscount,
  yearlyDiscountLoading = false,
  onEdit,
}: {
  tier: MembershipTier;
  yearlyDiscount: number;
  yearlyDiscountLoading?: boolean;
  onEdit?: () => void;
}) {
  const t = useTranslations();
  const isFree = tier.type === "free";

  return (
    <SectionCard
      title={tier.name}
      actions={
        onEdit ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            title={t("common.edit")}
            disabled={yearlyDiscountLoading}
          >
            <PencilIcon className="h-5 w-5" />
          </Button>
        ) : undefined
      }
      bodyClassName="space-y-4"
    >
      <p className="-mt-2 text-sm text-muted">
        {enumLabel(membershipTierConfig, tier.type)}
      </p>

      {tier.description && (
        <p className="text-sm text-muted">{tier.description}</p>
      )}

      <div className="space-y-2 text-sm">
        {!isFree && (
          <>
            <Row
              label={t("admin.tiers.card.monthly")}
              value={fmtTry(tier.monthlyPrice)}
            />
            <Row
              label={t("admin.tiers.card.yearly")}
              value={
                <AsyncValue loading={yearlyDiscountLoading} width="8ch">
                  {fmtTry(computedYearly(tier.monthlyPrice, yearlyDiscount))}
                </AsyncValue>
              }
            />
          </>
        )}
        <Row
          label={t("admin.tiers.card.freeListings")}
          value={tier.maxFreeListings}
        />
        <Row
          label={t("admin.tiers.card.totalListings")}
          value={
            tier.maxTotalListings === -1
              ? t("admin.tiers.card.unlimited")
              : tier.maxTotalListings
          }
        />
        <Row
          label={t("admin.tiers.card.imagesPerListing")}
          value={tier.maxImagesPerListing}
        />
        <div className="border-t border-border pt-2">
          <Row
            label={t("admin.tiers.card.userCount")}
            value={<span className="font-medium">{tier.userCount}</span>}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {tier.canCreateCollections && (
          <span className={`${featurePill} bg-success-50 text-success-700`}>
            {t("admin.tiers.card.collectionsPill")}
          </span>
        )}
        {tier.canTrade && (
          <span className={`${featurePill} bg-info-50 text-info-700`}>
            {t("admin.tiers.card.tradePill")}
          </span>
        )}
        {tier.isAdFree && (
          <span className={`${featurePill} bg-primary-50 text-primary-700`}>
            {t("admin.tiers.field.isAdFree")}
          </span>
        )}
        {!tier.isActive && (
          <span className={`${featurePill} bg-surface-alt text-muted`}>
            {t("common.inactive")}
          </span>
        )}
      </div>
    </SectionCard>
  );
}
