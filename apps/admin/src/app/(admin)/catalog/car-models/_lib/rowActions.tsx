import {
  activeToggleAction,
  editDeleteActions,
  type RowActionItem,
} from "@/components/table";
import type { CarModel } from "./types";
import type { Translate } from "@/lib/statusLabels";

export interface CarModelRowActions {
  onEdit: (m: CarModel) => void;
  onDelete: (m: CarModel) => void;
  /** Inline active/inactive toggle — in the Status column (not the menu). */
  onToggle: (m: CarModel) => void;
  busyId?: string | null;
}

/** ⋮ row-menu items for a car model. */
export function carModelRowMenu(
  { onEdit, onDelete, onToggle, busyId }: CarModelRowActions,
  t: Translate,
) {
  return (m: CarModel): RowActionItem[] => [
    activeToggleAction(m.isActive, () => onToggle(m), t, busyId === m.id),
    ...editDeleteActions(m, { onEdit, onDelete }, t),
  ];
}
