import { editDeleteActions, type RowActionItem } from "@/components/table";
import type { Category } from "./types";
import type { Translate } from "@/lib/statusLabels";

export interface CategoryRowActions {
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}

/** ⋮ row-menu items for a category. Delete is blocked while products exist. */
export function categoryRowMenu(
  { onEdit, onDelete }: CategoryRowActions,
  t: Translate,
) {
  return (c: Category): RowActionItem[] =>
    editDeleteActions(
      c,
      { onEdit, onDelete, deleteDisabled: c.productCount > 0 },
      t,
    );
}
