/** @format */

"use client";

import { useTranslations } from "next-intl";
import { RocketLaunchIcon } from "@heroicons/react/24/outline";
import { Badge, Button, Card } from "@tarodan/ui";
import { Link } from "@/i18n/navigation";
import {
  BOOST_STATUS_BADGE,
  isListingViewable,
  isStackedBehind,
  remainingParts,
  type BoostGroup,
} from "../_lib/boosts";
import BoostMetrics from "./BoostMetrics";
import BoostPurchase from "./BoostPurchase";
import BoostThumb from "./BoostThumb";
import ReminderToggle from "./ReminderToggle";

/**
 * "Aktif": the running and paused boosts of one listing as one card, so the
 * listing's remaining time (from `product.boostedUntil`, which already includes
 * the stacked boosts) shows once.
 */
export default function BoostGroupCard({
  group,
  now,
  onExtend,
}: {
  group: BoostGroup;
  now: number;
  onExtend: (group: BoostGroup) => void;
}) {
  const t = useTranslations();
  const { product, paused } = group;
  const badge = BOOST_STATUS_BADGE[paused ? "paused" : "active"];
  const left = paused ? null : remainingParts(product.boostedUntil, now);

  return (
    <Card variant="bordered" className="space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <BoostThumb
          src={product.image}
          title={product.title}
          productId={product.id}
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-1">
          {isListingViewable(product.status) ? (
            <Link
              href={`/listings/${product.id}`}
              className="line-clamp-2 font-semibold text-heading hover:text-primary-600"
            >
              {product.title}
            </Link>
          ) : (
            <p className="line-clamp-2 font-semibold text-heading">
              {product.title}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={badge.variant} size="sm">
              {t(badge.labelKey)}
            </Badge>
            {group.isBest && (
              <Badge variant="success" size="sm">
                {t("profile.boosts.best")}
              </Badge>
            )}
          </div>
        </div>
        {left && (
          <p className="shrink-0 text-right text-sm font-semibold text-heading">
            {left.days > 0
              ? t("profile.boosts.remaining", {
                  days: left.days,
                  hours: left.hours,
                })
              : t("profile.boosts.remainingHours", { hours: left.hours })}
          </p>
        )}
      </div>

      {paused && (
        <p className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-800">
          {t("profile.boosts.pausedHint")}
        </p>
      )}

      <ul className="divide-y divide-border text-sm">
        {group.rows.map((row) => (
          <li key={row.id} className="py-2 first:pt-0 last:pb-0">
            <BoostPurchase
              row={row}
              note={
                isStackedBehind(row, now) ? (
                  <p className="text-xs text-muted">
                    {t("profile.boosts.extended", { days: row.durationDays })}
                  </p>
                ) : undefined
              }
            />
          </li>
        ))}
      </ul>

      <BoostMetrics gain={group.gain} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <ReminderToggle
          productId={group.productId}
          checked={group.reminderOn}
        />
        {!paused && (
          <Button
            type="button"
            variant="warning"
            size="sm"
            leftIcon={<RocketLaunchIcon className="h-4 w-4" />}
            onClick={() => onExtend(group)}
          >
            {t("product.extendBoost")}
          </Button>
        )}
      </div>
    </Card>
  );
}
