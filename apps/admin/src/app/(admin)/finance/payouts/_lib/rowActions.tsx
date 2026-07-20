import { CheckCircleIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import { holdReasonForRow } from "./holds";
import type { PayoutTransaction } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Row menu for a payout transaction — only held rows can be released, blocked by locks/refunds. */
export function transactionRowMenu(
  onRelease: (orderId: string) => void,
  translate: T,
  releasingOrderId?: string,
) {
  return (t: PayoutTransaction): RowActionItem[] => {
    if (t.status !== "held") return [];
    const reason = holdReasonForRow({
      status: t.status,
      releaseAt: t.releaseAt,
    });
    const blocked = reason?.code === "frozen" || reason?.code === "open_refund";
    return [
      {
        label: translate("admin.finance.payouts.release"),
        icon: CheckCircleIcon,
        onClick: () => onRelease(t.orderId),
        disabled: blocked,
        isLoading: releasingOrderId === t.orderId,
      },
    ];
  };
}
