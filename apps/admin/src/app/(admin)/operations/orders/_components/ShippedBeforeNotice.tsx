"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useResourceList } from "@/components/list";
import { shippedBeforeDays } from "../_lib/shippedBefore";

/**
 * Etkin `?shippedBefore=` süzgeci ("10 günden uzun süredir kargoda") ve onu
 * kaldıran düğme. Süzgeç kontrolü olmayan bir deep-link parametresidir
 * (dashboard uyarısı); `DeepLinkFilterSummary` ile aynı satırda durur.
 */
export function ShippedBeforeNotice() {
  const t = useTranslations();
  const { filters, setFilter } = useResourceList();
  const days = shippedBeforeDays(filters.shippedBefore);

  if (days === null) return null;
  return (
    <span className="ml-2">
      — {t("admin.operations.orders.shippedBeforeChip", { days })}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setFilter("shippedBefore", "")}
        className="ml-2 text-primary-600 hover:underline"
      >
        {t("admin.operations.common.removeFilter")}
      </Button>
    </span>
  );
}
