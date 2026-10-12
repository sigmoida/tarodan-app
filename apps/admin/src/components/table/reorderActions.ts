import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import type { Translate } from "@/lib/statusLabels";
import type { RowAction } from "./RowActionMenu";

/**
 * Standart "Yukarı / Aşağı" satır eylemi çifti (`displayOrder` ile sıralanan
 * listeler). `index`/`total` satırın listedeki yeridir; uçlarda ilgili ok pasif.
 */
export function moveActions(
  onMove: (delta: -1 | 1) => void,
  { index, total }: { index: number; total: number },
  t: Translate,
  busy = false,
): RowAction[] {
  return [
    {
      label: t("admin.shared.rowActions.moveUp"),
      icon: ArrowUpIcon,
      onClick: () => onMove(-1),
      disabled: busy || index <= 0,
    },
    {
      label: t("admin.shared.rowActions.moveDown"),
      icon: ArrowDownIcon,
      onClick: () => onMove(1),
      disabled: busy || index < 0 || index >= total - 1,
    },
  ];
}
