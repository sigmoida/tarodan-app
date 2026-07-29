import { EyeIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { SuratShipmentRow } from "../_lib/types";

type T = ReturnType<typeof useTranslations<never>>;

export interface SuratRowActions {
  onSync: (id: string) => void;
  onViewOrder: (orderId: string) => void;
  syncingId?: string;
}

export function suratRowMenu(t: T, { onSync, onViewOrder, syncingId }: SuratRowActions) {
  return (r: SuratShipmentRow): RowActionItem[] => [
    {
      label: t("admin.operations.shipping.surat.refreshTracking"),
      icon: ArrowPathIcon,
      onClick: () => onSync(r.id),
      isLoading: syncingId === r.id,
    },
    r.order && {
      label: t("admin.operations.common.orderDetail"),
      icon: EyeIcon,
      onClick: () => onViewOrder(r.order!.id),
    },
  ];
}
