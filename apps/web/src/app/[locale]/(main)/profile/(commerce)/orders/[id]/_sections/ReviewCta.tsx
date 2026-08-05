/** @format */

"use client";

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
      <Button variant="primary" size="lg" className="w-full" onClick={onReview}>
        {t("review.writeReview")}
      </Button>
    </SectionCard>
  );
}
