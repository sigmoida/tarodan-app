/** @format */

"use client";

import SectionCard from "@/components/ui/SectionCard";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";

const NEXT_COPY: Record<string, MessageKey> = {
  pending_review: "refund.next.pendingReview",
  approved: "refund.next.approved",
  wait_for_delivery: "refund.next.waitForDelivery",
  return_shipment_open: "refund.next.returnShipmentOpen",
  return_in_transit: "refund.next.returnInTransit",
  return_delivered: "refund.next.returnDelivered",
  disputed: "refund.next.disputed",
};

export default function WhatsNextCard({ status }: { status: string }) {
  const t = useTranslations();
  const copyKey = NEXT_COPY[status];
  if (!copyKey) return null;

  return (
    <SectionCard title={t("refund.whatsNext")}>
      <p className="text-sm leading-relaxed text-muted">{t(copyKey)}</p>
    </SectionCard>
  );
}
