import { CheckCircleIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { PayoutTransaction } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Row menu for a payout transaction — only held rows can be released, blocked by locks/refunds. */
export function transactionRowMenu(
  onRelease: ((orderId: string) => void) | undefined,
  translate: T,
) {
  return (t: PayoutTransaction): RowActionItem[] => {
    if (t.status !== "held" || !onRelease) return [];
    const releaseDue =
      t.releaseAt != null && new Date(t.releaseAt).getTime() <= Date.now();
    return [
      {
        label: translate("admin.finance.payouts.release"),
        icon: CheckCircleIcon,
        onClick: () => onRelease(t.orderId),
        disabled: !releaseDue,
      },
    ];
  };
}
