"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useResourceList } from "@/components/list";

/**
 * List header description: total count + active deep-link filter notice
 * (productId / userId gelen linkler için "filtreyi kaldır" chip'i). Sipariş ve
 * teklif sekmeleri aynı bileşeni kullanır.
 */
export function DeepLinkFilterSummary({
  totalLabel,
}: {
  /** Omit to render only the deep-link chip (e.g. under a tab bar). */
  totalLabel?: (count: number) => string;
}) {
  const t = useTranslations();
  const { total, filters, setFilter, rows } = useResourceList<any>();

  const clearDeepLinkFilter = () =>
    setFilter(filters.productId ? "productId" : "userId", "");

  const firstProductTitle = rows[0]?.product?.title as string | undefined;
  const deepLinkFilterLabel = filters.productId
    ? firstProductTitle
      ? t("admin.operations.orders.filteringByProductNamed", {
          title: firstProductTitle,
        })
      : t("admin.operations.orders.filteringByProduct")
    : filters.userId
      ? t("admin.operations.common.filteringByUser")
      : null;

  if (!totalLabel && !deepLinkFilterLabel) return null;
  return (
    <>
      {totalLabel?.(total)}
      {deepLinkFilterLabel && (
        <span className="ml-2">
          — {deepLinkFilterLabel}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDeepLinkFilter}
            className="ml-2 text-primary-600 hover:underline"
          >
            {t("admin.operations.common.removeFilter")}
          </Button>
        </span>
      )}
    </>
  );
}
