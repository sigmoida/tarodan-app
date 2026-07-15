/** @format */

"use client";

import { StarIcon } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { canReview, type OrderDetail } from "../_lib/types";

/** Yorum Yap — sadece alınan siparişlerde, teslim/tamamlandıktan sonra. */
export default function ReviewCta({
  order,
  onReview,
}: {
  order: OrderDetail;
  onReview: () => void;
}) {
  const t = useTranslations();
  if (!canReview(order)) return null;

  return (
    <SectionCard title={t("review.reviewOrder")}>
      <p className="text-sm text-muted mb-4">
        {t("review.shareExperiencePrompt")}
      </p>
      <Button
        variant="primary"
        size="lg"
        className="w-full flex items-center justify-center gap-2"
        onClick={onReview}
      >
        <StarIcon className="w-5 h-5" />
        {t("review.writeReview")}
      </Button>
    </SectionCard>
  );
}
