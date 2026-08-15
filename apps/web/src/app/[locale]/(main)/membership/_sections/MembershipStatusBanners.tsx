/** @format */

"use client";

import { Button } from "@tarodan/ui";
import Notice from "../_components/Notice";
import type { MembershipDetails } from "../_lib/types";
import { useTranslations } from "next-intl";
import type { Translate } from "@/types/i18n";

const SCHEDULED_TIER_LABEL = (t: Translate): Record<string, string> => ({
  basic: t("membership.banners.temel"),
  premium: t("membership.banners.premium"),
  business: t("membership.banners.is"),
});

function fmtDate(iso: string | undefined, locale: string) {
  return iso
    ? new Date(iso).toLocaleDateString(locale, {
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
  const t = useTranslations();
  const isPaid = !!currentTier && currentTier !== "free";
  const isCancelled = membership.status === "cancelled";

  // İptal edildi ama dönem sürüyor
  if (isCancelled && isPaid) {
    return (
      <Notice>
        {t("membership.banners.cancelledUntil", {
          until: membership.currentPeriodEnd
            ? t("membership.banners.untilDate", {
                date: fmtDate(
                  membership.currentPeriodEnd,
                  t("common.dateLocale"),
                ),
              })
            : t("membership.banners.donemSonunaKadar"),
        })}
      </Notice>
    );
  }

  // Ertelemeli değişiklik (downgrade / periyot değişimi)
  if (
    !isCancelled &&
    (membership.scheduledTierType || membership.scheduledBillingPeriod)
  ) {
    const dateStr = membership.currentPeriodEnd
      ? t("membership.banners.onDate", {
          date: fmtDate(membership.currentPeriodEnd, t("common.dateLocale")),
        })
      : t("membership.banners.donemSonunda");
    const isTierChange =
      !!membership.scheduledTierType &&
      membership.scheduledTierType !== currentTier;
    const tierLabel =
      SCHEDULED_TIER_LABEL(t)[membership.scheduledTierType ?? ""] ??
      t("membership.banners.ucretsiz");
    const periodLabel =
      membership.scheduledBillingPeriod === "yearly"
        ? t("membership.banners.yillik")
        : t("membership.banners.aylik");
    return (
      <Notice
        action={
          <Button variant="outline" size="sm" onClick={onCancelScheduledChange}>
            {t("membership.banners.degisikligiIptalEt")}
          </Button>
        }
      >
        {isTierChange
          ? t.rich("membership.banners.scheduledTier", {
              when: dateStr,
              tier: tierLabel,
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })
          : t.rich("membership.banners.scheduledPeriod", {
              when: dateStr,
              period: periodLabel,
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
      </Notice>
    );
  }

  return null;
}
