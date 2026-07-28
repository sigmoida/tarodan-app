import { EyeIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { OrderGroupRow } from "./orders";
import { canManuallyUpdateOrderStatus } from "../[id]/_lib/status";

type T = ReturnType<typeof useTranslations<never>>;

export interface OrderRowActions {
  onView: (o: OrderGroupRow) => void;
  onEditStatus: (o: OrderGroupRow) => void;
}

/**
 * Row menu for an order row. Multi-item group rows expose only "Detay"
 * (per-order status editing happens from each order's detail page); a standalone
 * order also exposes "Durum Güncelle".
 */
export function orderRowMenu(
  t: T,
  { onView, onEditStatus }: OrderRowActions,
  canEditStatus = true,
) {
  return (o: OrderGroupRow): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        label: t("admin.operations.common.detail"),
        icon: EyeIcon,
        onClick: () => onView(o),
      },
    ];
    if (canEditStatus && !o.isGroup && canManuallyUpdateOrderStatus(o.status)) {
      items.push({
        label: t("admin.operations.orders.updateStatus"),
        icon: PencilSquareIcon,
        onClick: () => onEditStatus(o),
      });
    }
    return items;
  };
}
