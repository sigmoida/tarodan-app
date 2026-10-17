"use client";

import { Badge } from "@tarodan/ui";
import { earlyReleaseDays } from "@tarodan/types";
import { useTranslations } from "next-intl";

/**
 * "N gün erken" rozeti — escrow planlanan tarihinden önce bırakıldıysa.
 * Gün hesabı `earlyReleaseDays` (@tarodan/types) tek kaynağından gelir; liste,
 * sipariş dosyası ve takas detayı aynı rakamı gösterir. Erken değilse hiçbir şey
 * çizmez.
 */
export function EarlyReleaseBadge({
  releaseAt,
  releasedAt,
}: {
  releaseAt: string | null | undefined;
  releasedAt: string | null | undefined;
}) {
  const t = useTranslations();
  const days = earlyReleaseDays(releaseAt, releasedAt);
  if (days === null) return null;
  return (
    <Badge variant="warning" size="sm">
      {t("admin.shared.earlyRelease.daysEarly", { days })}
    </Badge>
  );
}
