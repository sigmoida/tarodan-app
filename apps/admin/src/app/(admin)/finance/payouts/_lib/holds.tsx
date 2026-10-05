import { Badge } from "@tarodan/ui";
import { describeHoldReason, type EscrowHoldReason } from "@/lib/escrow";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Payout hold reason from the ROW'S REAL DATA — the open-refund lock comes from
 * frozenByRefundId, never inferred. (The old version faked hasOpenRefund from
 * "releaseAt is overdue", so a merely-late hold showed "Açık iade var" and
 * contradicted the order group file's escrow card.)
 */
export function holdReasonForRow(
  args: {
    status: string;
    releaseAt: string | null;
    frozenByRefundId?: string | null;
  },
  returnWindowDays: number,
  t: T,
): EscrowHoldReason | null {
  if (args.status !== "held") return null;
  // releaseAt teslimde sunucuda yazılır: varlığı "teslim edildi" demektir ve
  // tarih ASLA yeniden hesaplanmaz.
  return describeHoldReason(
    {
      hasOpenRefund: !!args.frozenByRefundId,
      releaseAt: args.releaseAt,
      returnWindowDays,
    },
    t,
  );
}

export function HoldReasonBadge({
  reason,
}: {
  reason: EscrowHoldReason | null;
}) {
  if (!reason) return <span className="text-xs text-muted">—</span>;
  return (
    <Badge variant={reason.tone} size="sm" title={reason.detail}>
      {reason.label}
    </Badge>
  );
}
