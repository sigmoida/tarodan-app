import { Badge } from "@tarodan/ui";
import type { useTranslations } from "next-intl";
import { holdReasonView, type HoldReleaseFlags } from "./holdReason";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Hold'un "serbest bırakılabilir / neden değil" rozeti. Karar sunucudan gelen
 * `releasable` + `releaseBlockedReason` alanlarıdır (bkz. `holdReason.ts`);
 * burada yeniden hesaplanmaz.
 */
export function HoldReasonBadge({
  flags,
  t,
}: {
  flags: HoldReleaseFlags;
  t: T;
}) {
  const reason = holdReasonView(flags);
  if (!reason) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge variant={reason.tone} size="sm" title={t(reason.detailKey)}>
      {t(reason.labelKey)}
    </Badge>
  );
}
