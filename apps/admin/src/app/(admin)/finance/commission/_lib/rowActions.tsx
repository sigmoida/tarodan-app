import { EyeIcon } from "@heroicons/react/24/outline";
import { editDeleteActions, type RowActionItem } from "@/components/table";
import type { CommissionRule } from "./types";

export function commissionRowMenu({
  editable,
  viewLabel,
  onView,
  onEdit,
  onDelete,
}: {
  editable: boolean;
  viewLabel: string;
  onView: (rule: CommissionRule) => void;
  onEdit: (rule: CommissionRule) => void;
  onDelete: (rule: CommissionRule) => void;
}) {
  return (rule: CommissionRule): RowActionItem[] =>
    editable
      ? editDeleteActions(rule, { onEdit, onDelete })
      : [
          {
            label: viewLabel,
            icon: EyeIcon,
            onClick: () => onView(rule),
          },
        ];
}
