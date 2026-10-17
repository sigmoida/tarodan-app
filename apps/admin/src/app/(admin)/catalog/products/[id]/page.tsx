"use client";

import { Badge, productStatusConfig } from "@tarodan/ui";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { ProductDetailBody } from "./_components/ProductDetailBody";
import { statusConfig } from "@/lib/statusLabels";
import type { ProductDetail } from "./_lib/types";

export default function ProductDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();

  return (
    <DetailPage<ProductDetail>
      resource="products"
      id={id}
      fetcher={(pid) => adminApi.getProduct(pid).then((r) => r.data)}
      backHref="/catalog/products"
      emptyTitle={t("admin.catalog.products.empty")}
      title={(p) => p.title}
      subtitle={(p) =>
        t("admin.catalog.products.categoryLabel", { name: p.category.name })
      }
      badge={(p) => (
        <Badge
          status={p.status}
          config={statusConfig(productStatusConfig, t)}
        />
      )}
    >
      {(p) => <ProductDetailBody product={p} />}
    </DetailPage>
  );
}
