import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { Order } from "./orders";

type T = ReturnType<typeof useTranslations<never>>;

export interface OrderRowActions {
  onView: (o: Order) => void;
  onEditStatus: (o: Order) => void;
}

/** Row menu for an order — checkout-group summary rows expose no actions. */
export function orderRowMenu(t: T, { onView, onEditStatus }: OrderRowActions) {
  return (o: Order): RowActionItem[] => {
    if (o.isGroupSummary) return [];
    return [
      {
        label: t("admin.operations.common.detail"),
        icon: EyeIcon,
        onClick: () => onView(o),
      },
      {
        label: t("admin.operations.orders.updateStatus"),
        icon: PencilSquareIcon,
        onClick: () => onEditStatus(o),
      },
    ];
  };
}
