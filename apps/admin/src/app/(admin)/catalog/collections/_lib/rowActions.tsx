import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { editDeleteActions, type RowActionItem } from "@/components/table";
import type { Collection } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export interface CollectionRowActions {
  onToggleVisibility: (c: Collection) => void;
  onEdit: (c: Collection) => void;
  onDelete: (c: Collection) => void;
  busyId?: string;
}

/** ⋮ row-menu items for a collection. Visibility toggle label flips with state. */
export function collectionRowMenu(
  t: T,
  { onToggleVisibility, onEdit, onDelete, busyId }: CollectionRowActions,
) {
  return (c: Collection): RowActionItem[] => [
    {
      label: c.isPublic
        ? t("admin.catalog.collections.hide")
        : t("admin.catalog.collections.makeVisible"),
      icon: c.isPublic ? EyeSlashIcon : EyeIcon,
      onClick: () => onToggleVisibility(c),
      isLoading: busyId === c.id,
    },
    ...editDeleteActions(c, { onEdit, onDelete }),
  ];
}
