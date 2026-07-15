"use client";

import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { useResourceList } from "@/components/list";

/** List header description: total count + active deep-link filter notice. */
export function OrdersSummary() {
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

  return (
    <>
      {t("admin.operations.orders.totalCount", { count: total })}
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
