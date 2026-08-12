/** @format */

"use client";

import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";

/**
 * Toplu iade girişi: grupta birden fazla iade edilebilir kalem varsa alıcı
 * kalemleri seçip tek formla iade talep edebilir (BulkRefundModal). Tek
 * kalemlik iade butonu (RefundActions) ayrıca çalışmaya devam eder.
 */
export default function BulkRefundSection({
  count,
  onOpen,
}: {
  /** İade edilebilir kalem sayısı; 2+ değilse bölüm hiç render edilmez. */
  count: number;
  onOpen: () => void;
}) {
  const t = useTranslations();
  if (count < 2) return null;

  return (
    <SectionCard title={t("order.bulkRefundTitle")}>
      <p className="mb-4 text-sm text-muted">{t("order.bulkRefundIntro")}</p>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onOpen}>
        <ArrowUturnLeftIcon className="h-4 w-4" />
        {t("order.bulkRefundCta")}
      </Button>
    </SectionCard>
  );
}
