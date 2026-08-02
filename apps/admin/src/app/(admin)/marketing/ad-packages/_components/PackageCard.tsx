"use client";

import { Badge, Button } from "@tarodan/ui";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  packageDurations,
  type AdPackage,
  type AdPackageTier,
} from "../_lib/types";

const rangeKey = (t: AdPackageTier) => `${t.minAmount}|${t.maxAmount ?? "∞"}`;

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

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-heading">
              {pkg.name}
            </h3>
            {pkg.showcaseOnHome && (
              <Badge variant="primary" size="sm">
                {t("admin.marketing.adPackages.showcaseBadge")}
              </Badge>
            )}
            <Badge variant={pkg.isActive ? "success" : "default"} size="sm">
              {pkg.isActive ? t("common.active") : t("common.inactive")}
            </Badge>
            <Badge variant="secondary" size="sm">
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
          </div>
          <p className="mt-0.5 font-mono text-xs text-muted">{pkg.slug}</p>
        </div>
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
      </div>

      {pkg.tiers.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {t("admin.marketing.adPackages.noTiers")}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">
                  {t("admin.marketing.adPackages.priceRange")}
                </th>
                {durations.map((d) => (
                  <th key={d} className="px-3 py-2 text-right font-medium">
                    {d} {t("admin.marketing.adPackages.days")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranges.map((r) => (
                <tr key={r.key} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-body">
                    {rangeLabel(r, t("admin.marketing.adPackages.unlimited"))}
                  </td>
                  {durations.map((d) => {
                    const tier = byCell.get(`${r.key}#${d}`);
                    if (!tier)
                      return (
                        <td
                          key={d}
                          className="px-3 py-2 text-right text-subtle"
                        >
                          —
                        </td>
                      );
                    const hasCampaign = tier.campaignPrice != null;
                    return (
                      <td
                        key={d}
                        className="px-3 py-2 text-right tabular-nums text-heading"
                      >
                        {hasCampaign ? (
                          <span className="flex items-center justify-end gap-1.5">
                            <span className="text-xs text-subtle line-through">
                              {fmtTry(tier.price)}
                            </span>
                            <span className="font-semibold text-primary">
                              {fmtTry(tier.campaignPrice)}
                            </span>
                          </span>
                        ) : (
                          <span className="font-medium">
                            {fmtTry(tier.price)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
