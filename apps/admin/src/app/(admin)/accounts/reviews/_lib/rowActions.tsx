import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import { type ReviewStatus } from "./types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Approve / revert / reject row menu shared by both review tabs. */
export function reviewRowMenu(
  status: ReviewStatus | undefined,
  onAct: (s: ReviewStatus) => void,
  t: T,
  isLoading = false,
): RowActionItem[] {
  const s = status ?? "approved";
  return [
    s !== "approved" && {
      label: t("common.confirm"),
      icon: CheckCircleIcon,
      onClick: () => onAct("approved"),
      isLoading,
    },
    s === "rejected" && {
      label: t("admin.accounts.reviews.revert"),
      icon: ArrowUturnLeftIcon,
      onClick: () => onAct("pending"),
      isLoading,
    },
    s !== "rejected" && {
      label: t("admin.accounts.reviews.reject"),
      icon: XCircleIcon,
      onClick: () => onAct("rejected"),
      destructive: true,
      isLoading,
    },
  ];
}
