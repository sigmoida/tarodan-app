"use client";

import { useTranslations } from "next-intl";
import {
  AsyncValue,
  Badge,
  Button,
  enumLabel,
  membershipTierConfig,
} from "@tarodan/ui";
import { PencilIcon } from "@heroicons/react/24/outline";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { type MembershipTier, computedYearly } from "../_lib/types";
import { statusConfig } from "@/lib/statusLabels";

export function TierCard({
  tier,
  yearlyDiscount,
  yearlyDiscountLoading = false,
  onEdit,
}: {
  tier: MembershipTier;
  /** null = indirim oranı okunamadı; türetilen yıllık fiyat "—" gösterilir
   *  (uydurulmuş bir orandan hesaplanmış rakam GÖSTERİLMEZ). */
  yearlyDiscount: number | null;
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
        {enumLabel(statusConfig(membershipTierConfig, t), tier.type)}
      </p>

      {tier.description && (
        <p className="text-sm text-muted">{tier.description}</p>
      )}

      <DataList columns={1} className="gap-y-2">
        {!isFree && (
          <>
            <Field label={t("admin.tiers.card.monthly")}>
              {fmtTry(tier.monthlyPrice)}
            </Field>
            <Field label={t("admin.tiers.card.yearly")}>
              <AsyncValue loading={yearlyDiscountLoading} width="8ch">
                {fmtTry(
                  yearlyDiscount == null
                    ? null
                    : computedYearly(tier.monthlyPrice, yearlyDiscount),
                )}
              </AsyncValue>
            </Field>
          </>
        )}
        <Field label={t("admin.tiers.card.freeListings")}>
          {tier.maxFreeListings}
        </Field>
        <Field label={t("admin.tiers.card.totalListings")}>
          {tier.maxTotalListings === -1
            ? t("admin.tiers.card.unlimited")
            : tier.maxTotalListings}
        </Field>
        <Field label={t("admin.tiers.card.imagesPerListing")}>
          {tier.maxImagesPerListing}
        </Field>
      </DataList>
      <DataList columns={1} className="border-t border-border pt-2">
        <Field label={t("admin.tiers.card.userCount")}>{tier.userCount}</Field>
      </DataList>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {tier.canCreateCollections && (
          <Badge variant="success" size="sm">
            {t("admin.tiers.card.collectionsPill")}
          </Badge>
        )}
        {tier.canTrade && (
          <Badge variant="default" size="sm">
            {t("admin.tiers.card.tradePill")}
          </Badge>
        )}
        {tier.isAdFree && (
          <Badge variant="default" size="sm">
            {t("admin.tiers.field.isAdFree")}
          </Badge>
        )}
        {!tier.isActive && (
          <Badge variant="outline" size="sm">
            {t("common.inactive")}
          </Badge>
        )}
      </div>
    </SectionCard>
  );
}
