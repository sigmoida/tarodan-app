/** @format */

"use client";

import { ArrowPathIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Alert, Button, Checkbox } from "@tarodan/ui";
import { useTranslations } from "next-intl";

interface ExpiredListingsBannerProps {
  count: number;
  onShow: () => void;
}

/** Other tabs: "N listings expired" with a shortcut to the expired tab. */
export function ExpiredListingsBanner({
  count,
  onShow,
}: ExpiredListingsBannerProps) {
  const t = useTranslations();
  return (
    <Alert
      variant="warning"
      icon={<ClockIcon className="h-5 w-5 text-warning-600" />}
      title={t("profile.expiredListings.bannerTitle", { count })}
    >
      <p>{t("profile.expiredListings.bannerDescription")}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onShow}>
        {t("profile.expiredListings.tab")}
      </Button>
    </Alert>
  );
}

interface ExpiredSelectionBarProps {
  selectedCount: number;
  allSelected: boolean;
  isRenewing: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onRenew: () => void;
}

/** Expired tab: select all / some, renew the selection in one request. */
export function ExpiredSelectionBar({
  selectedCount,
  allSelected,
  isRenewing,
  onToggleAll,
  onClear,
  onRenew,
}: ExpiredSelectionBarProps) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3">
      <Checkbox
        checked={allSelected}
        indeterminate={selectedCount > 0 && !allSelected}
        onChange={onToggleAll}
        label={t("profile.expiredListings.selectAll")}
      />
      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t("profile.expiredListings.clearSelection")}
          </Button>
        )}
        <Button
          size="sm"
          className="gap-1"
          disabled={selectedCount === 0 || isRenewing}
          onClick={onRenew}
        >
          <ArrowPathIcon className="h-4 w-4" />
          {isRenewing
            ? t("profile.expiredListings.renewing")
            : t("profile.expiredListings.renewSelected", {
                count: selectedCount,
              })}
        </Button>
      </div>
    </div>
  );
}

interface ExpiredListingCheckboxProps {
  checked: boolean;
  onToggle: () => void;
}

/** Tick box floating over a card's corner on the expired tab. */
export function ExpiredListingCheckbox({
  checked,
  onToggle,
}: ExpiredListingCheckboxProps) {
  const t = useTranslations();
  return (
    <div className="absolute right-2 top-2 z-20 rounded-md bg-surface-elevated p-1 shadow-sm">
      <Checkbox
        aria-label={t("profile.expiredListings.select")}
        checked={checked}
        onChange={onToggle}
      />
    </div>
  );
}
