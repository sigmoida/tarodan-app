import { EyeIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { Refund } from "./columns";

type T = ReturnType<typeof useTranslations<never>>;

export function refundRowMenu(t: T, onViewOrder: (orderId: string) => void) {
  return (r: Refund): RowActionItem[] => [
    r.order && {
      label: t("admin.operations.common.orderDetail"),
      icon: EyeIcon,
      onClick: () => onViewOrder(r.order!.id),
    },
  ];
}
