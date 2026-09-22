import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  TruckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import type { AdminOrderListRow } from "@tarodan/types";
import type { RowActionItem } from "@/components/table";
import type { Translate } from "@/lib/statusLabels";
import { canManuallyUpdateOrderStatus } from "../[id]/_lib/status";
import { cancellableRowLine } from "../[id]/_lib/cancel";
import { rowDetailHref, rowSingleLine } from "./rowView";

/** Satır menüsünün açtığı sipariş modalı (sipariş dosyasındakilerle aynı). */
export type OrderRowModal =
  | { type: "status"; orderId: string; status: string }
  | { type: "tracking"; orderId: string }
  | { type: "cancel"; orderId: string; orderNumber: string };

export interface OrderRowActions {
  open: (href: string) => void;
  openModal: (modal: OrderRowModal) => void;
  /** Durum/takip/iptal yazma yetkisi (super_admin, admin). */
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
    const cancellable = canManage ? cancellableRowLine(row) : null;
    return [
      {
        label: t("admin.operations.orders.cells.openOrder"),
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
      cancellable && {
        label: t("admin.operations.orders.cancel.action"),
        icon: XCircleIcon,
        destructive: true,
        onClick: () =>
          openModal({
            type: "cancel",
            orderId: cancellable.orderId,
            orderNumber: cancellable.orderNumber,
          }),
      },
    ];
  };
}
