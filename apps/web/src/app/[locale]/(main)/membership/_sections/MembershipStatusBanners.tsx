/** @format */

"use client";

import { Button } from "@tarodan/ui";
import Notice from "../_components/Notice";
import type { MembershipDetails } from "../_lib/types";

const SCHEDULED_TIER_LABEL: Record<string, string> = {
  basic: "Temel",
  premium: "Premium",
  business: "İş",
};

function fmtDate(iso?: string) {
  return iso
    ? new Date(iso).toLocaleDateString("tr-TR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
}

interface Props {
  membership: MembershipDetails;
  currentTier: string | null;
  onCancelScheduledChange: () => void;
}

/**
 * The status notices shown to a logged-in member under the header.
 *
 * Yalnız EYLEM ya da YENİ bilgi taşıyan durumlar kaldı: iptal edilmiş üyelik ve
 * ertelenmiş plan/periyot değişikliği. "Mevcut plan: X" bandı çıkarıldı — aynı
 * bilgi hemen altındaki üyelik kartında ve plan kartındaki rozette zaten iki kez
 * daha yazıyordu; üç kopyanın en gürültülüsüydü (dolgulu mavi kutu).
 */
export default function MembershipStatusBanners({
  membership,
  currentTier,
  onCancelScheduledChange,
}: Props) {
  const isPaid = !!currentTier && currentTier !== "free";
  const isCancelled = membership.status === "cancelled";

  // İptal edildi ama dönem sürüyor
  if (isCancelled && isPaid) {
    return (
      <Notice>
        Üyeliğiniz iptal edildi.{" "}
        {membership.currentPeriodEnd
          ? `${fmtDate(membership.currentPeriodEnd)} tarihine kadar`
          : "Dönem sonuna kadar"}{" "}
        premium özellikleriniz devam eder, ardından ücretsiz üyeliğe geçersiniz.
      </Notice>
    );
  }

  // Ertelemeli değişiklik (downgrade / periyot değişimi)
  if (
    !isCancelled &&
    (membership.scheduledTierType || membership.scheduledBillingPeriod)
  ) {
    const dateStr = membership.currentPeriodEnd
      ? `${fmtDate(membership.currentPeriodEnd)} tarihinde`
      : "dönem sonunda";
    const isTierChange =
      !!membership.scheduledTierType &&
      membership.scheduledTierType !== currentTier;
    const tierLabel =
      SCHEDULED_TIER_LABEL[membership.scheduledTierType ?? ""] ?? "Ücretsiz";
    const periodLabel =
      membership.scheduledBillingPeriod === "yearly" ? "yıllık" : "aylık";
    return (
      <Notice
        action={
          <Button variant="outline" size="sm" onClick={onCancelScheduledChange}>
            Değişikliği iptal et
          </Button>
        }
      >
        Üyeliğiniz {dateStr}{" "}
        {isTierChange ? (
          <>
            <span className="font-semibold">{tierLabel}</span> planına geçecek.
          </>
        ) : (
          <>
            <span className="font-semibold">{periodLabel}</span> faturalamaya
            geçecek.
          </>
        )}{" "}
        O tarihe kadar mevcut üyelik avantajlarınız devam eder.
      </Notice>
    );
  }

  return null;
}
