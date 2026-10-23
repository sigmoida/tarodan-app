import { EyeIcon } from "@heroicons/react/24/outline";
import type { ReviewModerationStatus } from "@tarodan/types";
import type { RowActionItem } from "@/components/table";
import type { ReviewStatus } from "./types";
import {
  REVIEW_TRANSITION_ICON,
  REVIEW_TRANSITION_LABEL_KEY,
  reviewTransitions,
} from "@/components/reviews/transitions";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Detail / hide / show again row menu shared by both review tabs. */
export function reviewRowMenu(
  status: ReviewStatus | undefined,
  onAct: (s: ReviewModerationStatus) => void,
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
      icon: REVIEW_TRANSITION_ICON[target],
      onClick: () => onAct(target),
      destructive: target === "hidden",
      isLoading,
    })),
  ];
}
