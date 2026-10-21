/** @format */

"use client";

import { useState } from "react";
import { Badge, Button } from "@tarodan/ui";
import {
  SELLER_TRUST_LEVEL_I18N_KEYS,
  formatTrustRating,
  type SellerTrustView,
} from "@tarodan/types";
import { useLocale, useTranslations } from "next-intl";
import SellerTrustInfoModal from "../_modals/SellerTrustInfoModal";

interface SellerTrustBadgeProps {
  /** The profile's `trust` block; null for non-premium sellers. */
  trust: SellerTrustView | null | undefined;
}

/**
 * Trust score badge of the seller header. Renders nothing without a `trust`
 * block; pressing it opens the "how is it calculated" modal.
 */
export default function SellerTrustBadge({ trust }: SellerTrustBadgeProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [infoOpen, setInfoOpen] = useState(false);

  if (!trust) return null;

  const label =
    trust.level === "new" || trust.rating === null
      ? t("seller.trustScore.badgeNew")
      : t("seller.trustScore.badge", {
          rating: formatTrustRating(trust.rating, locale),
          level: t(SELLER_TRUST_LEVEL_I18N_KEYS[trust.level]),
        });

  return (
    <>
      <Button
        variant="ghost"
        className="h-auto rounded-full p-0"
        onClick={() => setInfoOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}. ${t("seller.trustScore.info.title")}`}
      >
        <Badge variant="warning" size="sm">
          {label}
        </Badge>
      </Button>
      <SellerTrustInfoModal
        isOpen={infoOpen}
        onClose={() => setInfoOpen(false)}
      />
    </>
  );
}
