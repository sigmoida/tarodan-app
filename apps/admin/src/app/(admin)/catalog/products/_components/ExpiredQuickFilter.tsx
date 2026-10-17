"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@tarodan/ui";
import { useResourceList } from "@/components/list";

/** Kaldırma nedeni filtresinin "süresi doldu" değeri (diyalogdaki seçenekle aynı). */
const EXPIRED_REASON = "expired";

/**
 * Pasif sekmesi için tek tıkla "Süresi dolanlar": `removalReason=expired`
 * filtresini açar, tekrar tıklanınca kaldırır. Filtre diyalogundaki aynı
 * alanı sürer, ikisi hep tutarlıdır.
 */
export function ExpiredQuickFilter() {
  const t = useTranslations();
  const { filters, setFilter } = useResourceList();
  const active = filters.removalReason === EXPIRED_REASON;

  return (
    <Chip
      active={active}
      onClick={() => setFilter("removalReason", active ? "" : EXPIRED_REASON)}
    >
      {t("admin.catalog.products.expiredQuickFilter")}
    </Chip>
  );
}
