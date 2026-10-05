"use client";

import { useMemo } from "react";
import { Badge, Button, EmptyState } from "@tarodan/ui";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { DataTable } from "@/components/DataTable";
import { SectionCard } from "@/components/detail/SectionCard";
import { col } from "@/components/table";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  packageDurations,
  type AdPackage,
  type AdPackageTier,
} from "../_lib/types";

const rangeKey = (t: AdPackageTier) => `${t.minAmount}|${t.maxAmount ?? "∞"}`;

type PriceRange = { key: string; min: number; max: number | null };

/** Unique product-price ranges across a package's tiers, sorted by lower bound. */
function priceRanges(pkg: AdPackage) {
  const map = new Map<string, { min: number; max: number | null }>();
  for (const tier of pkg.tiers) {
    if (!map.has(rangeKey(tier)))
      map.set(rangeKey(tier), { min: tier.minAmount, max: tier.maxAmount });
  }
  return Array.from(map.entries())
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => a.min - b.min);
}

function rangeLabel(
  r: { min: number; max: number | null },
  unlimited: string,
): string {
  return r.max == null
    ? `${fmtTry(r.min)}+`
    : `${fmtTry(r.min)} – ${fmtTry(r.max)}`;
}

/** One package = header (name/badges/actions) + a pricing matrix (ranges × durations). */
export function PackageCard({
  pkg,
  onEdit,
  onDelete,
}: {
  pkg: AdPackage;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const durations = packageDurations(pkg);
  const ranges = priceRanges(pkg);
  const byCell = new Map<string, AdPackageTier>();
  for (const tier of pkg.tiers) {
    byCell.set(`${rangeKey(tier)}#${tier.durationDays}`, tier);
  }

  // Fiyat aralığı sütunu + süre başına bir fiyat sütunu.
  const columns = useMemo(
    () => [
      col.text<PriceRange>(t("admin.marketing.adPackages.priceRange"), (r) =>
        rangeLabel(r, t("admin.marketing.adPackages.unlimited")),
      ),
      ...durations.map((d) =>
        col.custom<PriceRange>(
          `${d} ${t("admin.marketing.adPackages.days")}`,
          (r) => {
            const tier = byCell.get(`${r.key}#${d}`);
            if (!tier) return <span className="text-subtle">—</span>;
            return tier.campaignPrice != null ? (
              <span className="flex items-center justify-end gap-1.5 tabular-nums">
                <span className="text-xs text-subtle line-through">
                  {fmtTry(tier.price)}
                </span>
                <span className="font-semibold text-primary">
                  {fmtTry(tier.campaignPrice)}
                </span>
              </span>
            ) : (
              <span className="font-medium tabular-nums text-heading">
                {fmtTry(tier.price)}
              </span>
            );
          },
          { id: `duration-${d}`, align: "right" },
        ),
      ),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pkg, t],
  );

  return (
    <SectionCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate">{pkg.name}</span>
          {pkg.showcaseOnHome && (
            <Badge variant="default" size="sm">
              {t("admin.marketing.adPackages.showcaseBadge")}
            </Badge>
          )}
          <Badge variant={pkg.isActive ? "success" : "outline"} size="sm">
            {pkg.isActive ? t("common.active") : t("common.inactive")}
          </Badge>
          <Badge variant="outline" size="sm">
            {pkg.audienceMode === "everyone"
              ? t("admin.marketing.adPackages.audienceEveryone")
              : pkg.audienceMode === "membership_tiers"
                ? t("admin.marketing.adPackages.audienceTierCount", {
                    count: pkg.targetTierTypes.length,
                  })
                : pkg.audienceMode === "specific_users"
                  ? t("admin.marketing.adPackages.audienceUserCount", {
                      count: pkg.targetUsers.length,
                    })
                  : t("admin.marketing.adPackages.audienceMixedCount", {
                      tiers: pkg.targetTierTypes.length,
                      users: pkg.targetUsers.length,
                    })}
          </Badge>
        </span>
      }
      actions={
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<PencilSquareIcon className="h-4 w-4" />}
            onClick={onEdit}
          >
            {t("common.edit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t("common.delete")}
            onClick={onDelete}
          >
            <TrashIcon className="h-4 w-4 text-danger" />
          </Button>
        </div>
      }
    >
      <p className="-mt-2 mb-4 font-mono text-xs text-muted">{pkg.slug}</p>

      {pkg.tiers.length === 0 ? (
        <EmptyState
          size="compact"
          icon={false}
          title={t("admin.marketing.adPackages.noTiers")}
        />
      ) : (
        <DataTable
          dense
          columns={columns}
          data={ranges}
          getRowId={(r) => r.key}
        />
      )}
    </SectionCard>
  );
}
