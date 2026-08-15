import { editDeleteActions, type RowActionItem } from "@/components/table";
import type { Ad } from "./types";
import type { Translate } from "@/lib/statusLabels";

export interface AdRowActions {
  onEdit: (ad: Ad) => void;
  onDelete: (ad: Ad) => void;
}

export function adRowMenu({ onEdit, onDelete }: AdRowActions, t: Translate) {
  return (ad: Ad): RowActionItem[] =>
    editDeleteActions(ad, { onEdit, onDelete }, t);
}
