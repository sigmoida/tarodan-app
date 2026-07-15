import { EyeIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { Trade } from "./trades";

type T = ReturnType<typeof useTranslations<never>>;

/** Row menu for a trade — resolution happens on the detail page, so both items navigate. */
export function tradeRowMenu(t: T, onView: (trade: Trade) => void) {
  return (trade: Trade): RowActionItem[] => [
    {
      label: t("admin.operations.common.detail"),
      icon: EyeIcon,
      onClick: () => onView(trade),
    },
    trade.hasDispute && {
      label: t("admin.operations.trades.resolveDispute"),
      icon: ExclamationTriangleIcon,
      onClick: () => onView(trade),
      destructive: true,
    },
  ];
}
