"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState } from "@tarodan/ui";
import { DataList, Field } from "@/components/detail/DataList";
import { SectionCard } from "@/components/detail/SectionCard";
import { Eyebrow } from "@/components/detail/SectionTitle";
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

      <Eyebrow className="mb-2">
        {t("admin.shippingTariffs.tiersTitle")}
      </Eyebrow>
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
        <EmptyState
          size="compact"
          icon={false}
          title={t("admin.shippingTariffs.noTiers")}
        />
      )}

      <DataList columns={1} className="mt-3 gap-y-1">
        <Field label={t("admin.shippingTariffs.freeShipping")}>
          {tariff.freeShippingEnabled
            ? t("admin.shippingTariffs.freeOver", {
                amount: fmtTry(Number(tariff.freeShippingThreshold)),
              })
            : t("admin.shippingTariffs.freeDisabled")}
        </Field>
        {/* Son yazma anı: taslakta "en son ne zaman düzenlendi", aktif/arşiv
            tarifede "ne zaman aktifleştirildi/arşivlendi" sorusunu cevaplar. */}
        <Field label={t("admin.shippingTariffs.lastUpdated")}>
          {fmtDateTime(tariff.updatedAt) ?? "—"}
        </Field>
      </DataList>

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
