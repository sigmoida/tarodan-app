/** @format */

"use client";

import { Badge, Select } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import type { PaytrMerchant } from "../_lib/types";

/** "" = tüm mağazalar. */
export type MerchantFilterValue = PaytrMerchant | "";

/**
 * PayTR mağaza seçici. Pazaryeri (sipariş/takas/öne çıkarma) ve üyelik
 * mağazaları ayrı döküm ve hakediş üretir; ekran ikisini birlikte ya da ayrı
 * gösterebilir.
 */
export function MerchantFilter({
  value,
  onChange,
}: {
  value: MerchantFilterValue;
  onChange: (value: MerchantFilterValue) => void;
}) {
  const t = useTranslations();
  return (
    <Select
      aria-label={t("admin.finance.psp.merchant.label")}
      value={value}
      onChange={(e) => onChange(e.target.value as MerchantFilterValue)}
      options={[
        { value: "", label: t("admin.finance.psp.merchant.all") },
        {
          value: "marketplace",
          label: t("admin.finance.psp.merchant.marketplace"),
        },
        {
          value: "membership",
          label: t("admin.finance.psp.merchant.membership"),
        },
      ]}
    />
  );
}

/** Satırın hangi PayTR mağazasından geldiği. */
export function MerchantBadge({ merchant }: { merchant: PaytrMerchant }) {
  const t = useTranslations();
  return (
    <Badge variant={merchant === "membership" ? "info" : "default"}>
      {t(`admin.finance.psp.merchant.${merchant}`)}
    </Badge>
  );
}
