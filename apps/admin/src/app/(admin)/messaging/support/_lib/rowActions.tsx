import { EyeIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { GuestContact } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function guestRowMenu(onView: (g: GuestContact) => void, t: T) {
  return (g: GuestContact): RowActionItem[] => [
    { label: t("common.view"), icon: EyeIcon, onClick: () => onView(g) },
  ];
}
