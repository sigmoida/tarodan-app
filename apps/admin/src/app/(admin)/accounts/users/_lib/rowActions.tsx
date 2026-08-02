import { NoSymbolIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { RowActionItem } from "@/components/table";
import type { User } from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export interface UserRowActions {
  onBanToggle: (u: User) => void;
  busyId?: string;
}

export function userRowMenu(t: T, { onBanToggle, busyId }: UserRowActions) {
  return (u: User): RowActionItem[] => [
    {
      label: u.isBanned
        ? t("admin.users.unbanAction")
        : t("admin.users.banAction"),
      icon: u.isBanned ? CheckCircleIcon : NoSymbolIcon,
      onClick: () => onBanToggle(u),
      destructive: !u.isBanned,
      isLoading: busyId === u.id,
    },
  ];
}
