"use client";

import { useTranslations } from "next-intl";
import { Badge, Button } from "@tarodan/ui";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtDateTime, fmtTry } from "@/lib/format";
import {
  type ShippingTariff,
  STATUS_KEY,
  STATUS_VARIANT,
  tierRangeLabel,
} from "../_lib/types";

/**
 * Tek bir tarife sürümünün kartı.
 *
 * Kartın ASIL bilgisi paket boyutlarının fiyatıdır — o yüzden üç boyut tek satıra
 * sıkıştırılmış bir metin yerine kendi listesinde, tutarlar sağda hizalı gösterilir.
 * Etiket satırları (sağlayıcı/sürüm) başlığın altına başlık-üstü bilgisi olarak
 * iner; böylece kartta yalnız fiyat tablosu ve ücretsiz kargo kuralı kalır.
 */
export function TariffCard({
  tariff,
  onEdit,
  onActivate,
  isActivating,
}: {
  tariff: ShippingTariff;
  onEdit: () => void;
  onActivate: () => void;
  isActivating: boolean;
}) {
  const t = useTranslations();
  const isActive = tariff.status === "active";
  const tiers = tariff.packageTiers ?? [];

  return (
    <SectionCard className={isActive ? "border-primary-300" : undefined}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-heading">{tariff.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {tariff.provider} · v{tariff.version}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[tariff.status]} size="sm">
          {t(STATUS_KEY[tariff.status])}
        </Badge>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {t("admin.shippingTariffs.tiersTitle")}
      </p>
      {tiers.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tiers.map((tier) => (
            <li
              key={tier.code}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-body">
                {tier.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {tierRangeLabel(tier)}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-heading">
                {fmtTry(Number(tier.amount))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-subtle">
          {t("admin.shippingTariffs.noTiers")}
        </p>
      )}

      <dl className="mt-3 space-y-1 text-sm">
        <Row
          label={t("admin.shippingTariffs.freeShipping")}
          value={
            tariff.freeShippingEnabled
              ? t("admin.shippingTariffs.freeOver", {
                  amount: fmtTry(Number(tariff.freeShippingThreshold)),
                })
              : t("admin.shippingTariffs.freeDisabled")
          }
        />
        {/* Son yazma anı: taslakta "en son ne zaman düzenlendi", aktif/arşiv
            tarifede "ne zaman aktifleştirildi/arşivlendi" sorusunu cevaplar. */}
        <Row
          label={t("admin.shippingTariffs.lastUpdated")}
          value={fmtDateTime(tariff.updatedAt) ?? "—"}
        />
      </dl>

      {tariff.status === "draft" && (
        <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {t("admin.shippingTariffs.edit")}
          </Button>
          <Button size="sm" isLoading={isActivating} onClick={onActivate}>
            {t("admin.shippingTariffs.activate")}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-body">{value}</dd>
    </div>
  );
}
