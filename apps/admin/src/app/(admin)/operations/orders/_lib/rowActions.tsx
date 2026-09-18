import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import type { AdminOrderListRow } from "@tarodan/types";
import type { RowActionItem } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import { canManuallyUpdateOrderStatus } from "../[id]/_lib/status";
import { rowDetailHref, rowSingleLine } from "./rowView";

/** Satır menüsünün açtığı sipariş modalı (sipariş dosyasındakilerle aynı). */
export type OrderRowModal =
  | { type: "status"; orderId: string; status: string }
  | { type: "tracking"; orderId: string };

export interface OrderRowActions {
  open: (href: string) => void;
  openModal: (modal: OrderRowModal) => void;
  /** Durum/takip yazma yetkisi (super_admin, admin). */
  canManage: boolean;
}

/**
 * ⋮ satır menüsü: dosyayı aç + tek kalemli satırda sipariş dosyasındaki manuel
 * işlemler (aynı koşullar, aynı modallar). Çok kalemli sepette işlemler
 * dosyada kalemi seçerek yapılır.
 */
export function orderRowMenu(
  { open, openModal, canManage }: OrderRowActions,
  t: Translate,
) {
  return (row: AdminOrderListRow): RowActionItem[] => {
    const line = canManage ? rowSingleLine(row) : null;
    return [
      {
        label: row.detailOrderId
          ? t("admin.operations.orders.cells.openOrder")
          : t("admin.operations.orders.cells.openOffer"),
        icon: ArrowTopRightOnSquareIcon,
        onClick: () => open(rowDetailHref(row)),
      },
      line &&
        canManuallyUpdateOrderStatus(line.status) && {
          label: t("admin.operations.orders.updateStatus"),
          icon: PencilSquareIcon,
          onClick: () =>
            openModal({
              type: "status",
              orderId: line.orderId,
              status: line.status,
            }),
        },
      line &&
        line.status === "preparing" && {
          label: t("admin.operations.orders.addTracking"),
          icon: TruckIcon,
          onClick: () => openModal({ type: "tracking", orderId: line.orderId }),
        },
    ];
  };
}
