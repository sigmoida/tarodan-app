/** @format */

"use client";

import { Button, Toggle } from "@tarodan/ui";
import Notice from "../_components/Notice";
import type { MembershipDetails } from "../_lib/types";
import { useTranslations } from "next-intl";

function fmtDate(iso: string | undefined, locale: string) {
  return iso
    ? new Date(iso).toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";
}

interface Props {
  membership: MembershipDetails;
  autoRenewSaving: boolean;
  cancelling: boolean;
  onToggleAutoRenew: (next: boolean) => void;
  onCancel: () => void;
}

/**
 * Logged-in, paid-tier management: dates + auto-renew + cancel.
 *
 * Sadeleştirildi: tarihler renkli ikon kutucukları yerine düz bir künye satırı.
 * Kutucuklar (mavi/yeşil daire + takvim ikonu) iki basit tarihe sayfadaki en
 * ağır görsel vurguyu veriyordu; taşıdıkları ek bir bilgi yoktu.
 */
export default function CurrentMembershipCard({
  membership,
  autoRenewSaving,
  cancelling,
  onToggleAutoRenew,
  onCancel,
}: Props) {
  const t = useTranslations();
  const isCancelled = membership.status === "cancelled";

  return (
    <div className="rounded-lg border border-border bg-surface-elevated">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="font-semibold text-heading">
          {t("membership.currentCard.mevcutUyelikBilgileri")}
        </h2>
      </div>

      <dl className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">
            {t("membership.currentCard.uyelikBaslangicTarihi")}
          </dt>
          <dd className="mt-0.5 font-medium text-heading">
            {fmtDate(membership.currentPeriodStart, t("common.dateLocale"))}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            {isCancelled
              ? t("membership.currentCard.gecerlilikBitisTarihi")
              : t("membership.currentCard.yenilenmeTarihi")}
          </dt>
          <dd className="mt-0.5 font-medium text-heading">
            {fmtDate(membership.currentPeriodEnd, t("common.dateLocale"))}
          </dd>
        </div>
      </dl>

      {/* Otomatik yenileme — hatırlatma tabanlı (sessiz çekim yok) */}
      <div className="flex items-start justify-between gap-4 border-t border-border-subtle px-6 py-5">
        <div>
          <h3 className="text-sm font-semibold text-heading">
            {t("membership.currentCard.otomatikYenileme")}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {t(
              "membership.currentCard.etkinlestirildigindeUyeliginizDonemSonundaSectiginizPlana",
            )}
          </p>
        </div>
        <Toggle
          checked={!!membership.autoRenew}
          onChange={onToggleAutoRenew}
          disabled={autoRenewSaving}
          label={t("membership.currentCard.otomatikYenileme2")}
        />
      </div>

      {/* Üyelik iptali */}
      <div className="border-t border-border-subtle px-6 py-5">
        {isCancelled ? (
          <Notice>
            {t("membership.currentCard.cancelledNotice", {
              date: fmtDate(
                membership.currentPeriodEnd,
                t("common.dateLocale"),
              ),
            })}
          </Notice>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-heading">
                {t("membership.currentCard.uyeligiIptalEt")}
              </h3>
              <p className="mt-1 text-sm text-muted">
                {t(
                  "membership.currentCard.iptalEttiginizdeMevcutDonemSonunaKadar",
                )}
              </p>
            </div>
            <Button
              variant="danger"
              onClick={onCancel}
              disabled={cancelling}
              className="flex-shrink-0"
            >
              {cancelling
                ? t("membership.currentCard.iptalEdiliyor")
                : t("membership.currentCard.uyeligiIptalEt")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
