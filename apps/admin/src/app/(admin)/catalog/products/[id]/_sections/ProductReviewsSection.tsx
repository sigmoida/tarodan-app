"use client";

import { useTranslations } from "next-intl";
import { StarIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { Avatar, Badge, EmptyState, IconButton } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { ReviewModerationModal } from "@/components/reviews/ReviewModerationModal";
import { reviewStatusConfig } from "@/components/reviews/reviewStatus";
import {
  REVIEW_TRANSITION_ICON,
  REVIEW_TRANSITION_LABEL_KEY,
  reviewTransitions,
} from "@/components/reviews/transitions";
import { useReviewModeration } from "@/components/reviews/useReviewModeration";
import { fmtDate } from "@/lib/format";
import { SectionCard } from "@/components/detail/SectionCard";
import type { Review } from "../_lib/types";

function Stars({ score }: { score: number }) {
  return (
    <div className="flex text-warning-500">
      {[...Array(5)].map((_, i) =>
        i < score ? (
          <StarIconSolid key={i} className="h-4 w-4" />
        ) : (
          <StarIcon key={i} className="h-4 w-4" />
        ),
      )}
    </div>
  );
}

export function ProductReviewsSection({
  productId,
  reviews,
}: {
  productId: string;
  reviews: Review[];
}) {
  const t = useTranslations();
  const { request, busyId, modalProps } = useReviewModeration(
    (id, body) => adminApi.updateReviewStatus(id, body),
    t("admin.accounts.reviews.productReview"),
  );
  const statusConfig = reviewStatusConfig(t);

  return (
    <SectionCard
      title={t("admin.catalog.products.reviewsTitle")}
      bodyClassName="space-y-4"
    >
      {reviews.length === 0 ? (
        <EmptyState
          size="compact"
          icon={false}
          title={t("admin.catalog.products.noReviews")}
        />
      ) : (
        <div className="divide-y divide-border">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="flex items-start justify-between gap-4 py-4 first:pt-0"
            >
              <div className="flex min-w-0 items-start gap-4">
                <Avatar fallback={review.user.displayName.charAt(0)} />
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium text-heading">
                      {review.user.displayName}
                    </span>
                    {review.isVerifiedPurchase && (
                      <span className="flex items-center gap-1 text-xs text-success-600">
                        <CheckCircleIcon className="h-3 w-3" />{" "}
                        {t("admin.catalog.products.verifiedBuyer")}
                      </span>
                    )}
                    <Badge status={review.status} config={statusConfig} />
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Stars score={review.score} />
                    <span className="text-sm text-muted">
                      {fmtDate(review.createdAt)}
                    </span>
                  </div>
                  {review.title && (
                    <p className="mb-1 font-medium text-heading">
                      {review.title}
                    </p>
                  )}
                  {review.review && (
                    <p className="text-muted">{review.review}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {reviewTransitions(review.status).map((target) => {
                  const Icon = REVIEW_TRANSITION_ICON[target];
                  const label = t(REVIEW_TRANSITION_LABEL_KEY[target]);
                  return (
                    <IconButton
                      key={target}
                      variant="ghost"
                      aria-label={label}
                      title={label}
                      onClick={() => request(review.id, target)}
                      isLoading={busyId === review.id}
                      disabled={busyId === review.id}
                    >
                      <Icon
                        className={
                          target === "hidden"
                            ? "h-5 w-5 text-danger-600"
                            : "h-5 w-5 text-success-600"
                        }
                      />
                    </IconButton>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <ReviewModerationModal {...modalProps} />
    </SectionCard>
  );
}
