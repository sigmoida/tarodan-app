import { EyeIcon } from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import type { Payment } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export function paymentRowMenu(onView: (p: Payment) => void, t: T) {
  return (p: Payment): RowActionItem[] => [
    { label: t("common.details"), icon: EyeIcon, onClick: () => onView(p) },
  ];
}
