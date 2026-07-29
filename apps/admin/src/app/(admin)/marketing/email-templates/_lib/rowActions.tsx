import { PencilIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { TemplateListItem } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function templateRowMenu(onEdit: (key: string) => void, t: T) {
  return (template: TemplateListItem): RowActionItem[] => [
    {
      label: t("common.edit"),
      icon: PencilIcon,
      onClick: () => onEdit(template.key),
    },
  ];
}
