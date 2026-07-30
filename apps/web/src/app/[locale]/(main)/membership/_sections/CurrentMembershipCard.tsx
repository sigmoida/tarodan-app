/** @format */

"use client";

import { Button, Toggle } from "@tarodan/ui";
import Notice from "../_components/Notice";
import type { MembershipDetails } from "../_lib/types";

function fmtDate(iso?: string) {
  return iso
    ? new Date(iso).toLocaleDateString("tr-TR", {
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
  const isCancelled = membership.status === "cancelled";

  return (
    <div className="rounded-lg border border-border bg-surface-elevated">
      <div className="border-b border-border-subtle px-6 py-4">
        <h2 className="font-semibold text-heading">Mevcut Üyelik Bilgileri</h2>
      </div>

      <dl className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">Üyelik Başlangıç Tarihi</dt>
          <dd className="mt-0.5 font-medium text-heading">
            {fmtDate(membership.currentPeriodStart)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            {isCancelled ? "Geçerlilik Bitiş Tarihi" : "Yenilenme Tarihi"}
          </dt>
          <dd className="mt-0.5 font-medium text-heading">
            {fmtDate(membership.currentPeriodEnd)}
          </dd>
        </div>
      </dl>

      {/* Otomatik yenileme — hatırlatma tabanlı (sessiz çekim yok) */}
      <div className="flex items-start justify-between gap-4 border-t border-border-subtle px-6 py-5">
        <div>
          <h3 className="text-sm font-semibold text-heading">
            Otomatik Yenileme
          </h3>
          <p className="mt-1 text-sm text-muted">
            Etkinleştirildiğinde üyeliğiniz dönem sonunda seçtiğiniz plana göre
            kayıtlı kartınızdan otomatik yenilenir. Devre dışı bırakırsanız
            ücret tahsil edilmez.
          </p>
        </div>
        <Toggle
          checked={!!membership.autoRenew}
          onChange={onToggleAutoRenew}
          disabled={autoRenewSaving}
          label="Otomatik yenileme"
        />
      </div>

      {/* Üyelik iptali */}
      <div className="border-t border-border-subtle px-6 py-5">
        {isCancelled ? (
          <Notice>
            Üyeliğiniz iptal edildi — {fmtDate(membership.currentPeriodEnd)}{" "}
            tarihine kadar tüm özellikleriniz aktif kalır. Sonrasında otomatik
            olarak ücretsiz plana geçilir.
          </Notice>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-heading">
                Üyeliği İptal Et
              </h3>
              <p className="mt-1 text-sm text-muted">
                İptal ettiğinizde mevcut dönem sonuna kadar özelliklerinizi
                kullanmaya devam edersiniz; sonra ücretsiz plana geçilir. Ücret
                iadesi yapılmaz.
              </p>
            </div>
            <Button
              variant="danger"
              onClick={onCancel}
              disabled={cancelling}
              className="flex-shrink-0"
            >
              {cancelling ? "İptal Ediliyor..." : "Üyeliği İptal Et"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
