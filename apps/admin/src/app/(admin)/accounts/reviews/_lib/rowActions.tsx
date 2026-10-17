import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowUturnLeftIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import type { RowActionItem } from "@/components/table";
import { type ReviewStatus } from "./types";
import { REVIEW_TRANSITION_LABEL_KEY, reviewTransitions } from "./transitions";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

const TRANSITION_ICON = {
  approved: CheckCircleIcon,
  pending: ArrowUturnLeftIcon,
  rejected: XCircleIcon,
} as const satisfies Record<ReviewStatus, unknown>;

/** Detail / approve / revert / reject row menu shared by both review tabs. */
export function reviewRowMenu(
  status: ReviewStatus | undefined,
  onAct: (s: ReviewStatus) => void,
  t: T,
  isLoading = false,
  onOpenDetail?: () => void,
): RowActionItem[] {
  return [
    onOpenDetail && {
      label: t("admin.accounts.reviews.detail.open"),
      icon: EyeIcon,
      onClick: onOpenDetail,
    },
    ...reviewTransitions(status).map((target) => ({
      label: t(REVIEW_TRANSITION_LABEL_KEY[target]),
      icon: TRANSITION_ICON[target],
      onClick: () => onAct(target),
      destructive: target === "rejected",
      isLoading,
    })),
  ];
}
