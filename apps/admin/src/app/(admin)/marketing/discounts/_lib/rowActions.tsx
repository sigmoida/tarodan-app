import {
  activeToggleAction,
  editDeleteActions,
  type RowActionItem,
} from "@/components/table";
import { TicketIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import type { Discount } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface DiscountRowActions {
  onToggle: (d: Discount) => void;
  onEdit: (d: Discount) => void;
  onDelete: (d: Discount) => void;
  onGenerateCodes: (d: Discount) => void;
  onExportCodes: (d: Discount) => void;
  busyId?: string;
}

/** Discount row ⋮ menu: active/inactive + edit + delete + voucher codes. */
export function discountRowMenu(
  {
    onToggle,
    onEdit,
    onDelete,
    onGenerateCodes,
    onExportCodes,
    busyId,
  }: DiscountRowActions,
  t: T,
) {
  return (d: Discount): RowActionItem[] => [
    activeToggleAction(d.isActive, () => onToggle(d), busyId === d.id),
    {
      label: t("admin.marketing.discounts.codes.rowGenerate"),
      icon: TicketIcon,
      onClick: () => onGenerateCodes(d),
    },
    {
      label: t("admin.marketing.discounts.codes.rowExport"),
      icon: ArrowDownTrayIcon,
      onClick: () => onExportCodes(d),
    },
    ...editDeleteActions(d, { onEdit, onDelete }),
  ];
}
