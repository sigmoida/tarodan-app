import { editDeleteActions, type RowActionItem } from "@/components/table";
import type { CommissionRule } from "./types";

export function commissionRowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
}) {
  return (rule: CommissionRule): RowActionItem[] =>
    editDeleteActions(rule, { onEdit, onDelete });
}
