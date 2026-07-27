/** @format */

"use client";

import { StarIcon } from "@heroicons/react/24/solid";
import { Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyStateCard, SectionCard } from "@/components/ui";
import UserAvatar from "@/components/UserAvatar";
import type { RatingStats, UserRating } from "../../_lib/types";

const DATE_LOCALES: Record<string, string> = { en: "en-US", tr: "tr-TR" };

interface ReviewsTabProps {
  reviews: UserRating[];
  loading: boolean;
  ratingStats: RatingStats | null;
  averageRating: number;
  totalRatings: number;
  locale: string;
}

function Stars({
  score,
  className = "h-4 w-4",
}: {
  score: number;
  className?: string;
}) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon
          key={s}
          className={`${className} ${s <= score ? "text-warning-400" : "text-border-subtle"}`}
        />
      ))}
    </span>
  );
}

export default function ReviewsTab({
  reviews,
  loading,
  ratingStats,
  averageRating,
  totalRatings,
  locale,
}: ReviewsTabProps) {
  const t = useTranslations();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }
  if (reviews.length === 0) {
    return (
      <EmptyStateCard
        title={t("review.noReviews")}
        description={t("seller.noReviewsDesc")}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Summary */}
      <div className="lg:col-span-1">
        <SectionCard className="sticky top-24">
          <div className="mb-6 text-center">
            <div className="mb-2 text-5xl font-bold text-heading">
              {averageRating.toFixed(1)}
            </div>
            <div className="mb-2 flex justify-center">
              <Stars score={Math.round(averageRating)} className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted">
              {totalRatings} {t("seller.totalReviews")}
            </p>
          </div>
          {ratingStats?.scoreDistribution && (
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((score) => {
                const count =
                  ratingStats.scoreDistribution?.[
                    score as keyof NonNullable<RatingStats["scoreDistribution"]>
                  ] || 0;
                const pct =
                  ratingStats.totalRatings > 0
                    ? (count / ratingStats.totalRatings) * 100
                    : 0;
                return (
                  <div key={score} className="flex items-center gap-3">
                    <span className="w-3 text-sm text-muted">{score}</span>
                    <StarIcon className="h-4 w-4 text-warning-400" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-warning-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-sm text-muted">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* List */}
      <div className="space-y-4 lg:col-span-2">
        {reviews.map((review) => {
          const reviewerName =
            review.giverName || review.giver?.displayName || "";
          const giverId = review.giver?.id;
          return (
            <div
              key={review.id}
              className="rounded-xl border border-border-subtle bg-surface-elevated p-5"
            >
              <div className="flex items-start gap-4">
                {giverId ? (
                  <Link href={`/seller/${giverId}`} className="flex-shrink-0">
                    <UserAvatar
                      displayName={reviewerName}
                      avatarUrl={review.giver?.avatarUrl}
                      size="sm"
                      className="!h-11 !w-11 rounded-xl"
                    />
                  </Link>
                ) : (
                  <UserAvatar
                    displayName={reviewerName}
                    avatarUrl={review.giver?.avatarUrl}
                    size="sm"
                    className="!h-11 !w-11 flex-shrink-0 rounded-xl"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-start justify-between gap-4">
                    <div>
                      {giverId ? (
                        <Link
                          href={`/seller/${giverId}`}
                          className="font-semibold text-heading transition-colors hover:text-primary-600"
                        >
                          {reviewerName || t("common.user")}
                        </Link>
                      ) : (
                        <p className="font-semibold text-heading">
                          {reviewerName || t("common.user")}
                        </p>
                      )}
                      <p className="text-xs text-muted">
                        {new Date(review.createdAt).toLocaleDateString(
                          DATE_LOCALES[locale] ?? "tr-TR",
                          {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </p>
                    </div>
                    <span className="rounded-lg bg-warning-50 px-2 py-1">
                      <Stars score={review.score} />
                    </span>
                  </div>
                  {review.comment && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                      {review.comment}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
