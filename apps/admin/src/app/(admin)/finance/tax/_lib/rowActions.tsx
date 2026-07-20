import { TrashIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { VatOverride } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function vatOverrideRowMenu(onDelete: (o: VatOverride) => void, t: T) {
  return (o: VatOverride): RowActionItem[] => [
    {
      label: t("common.delete"),
      icon: TrashIcon,
      onClick: () => onDelete(o),
      destructive: true,
    },
  ];
}
