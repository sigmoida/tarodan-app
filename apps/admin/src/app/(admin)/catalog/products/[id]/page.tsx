"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { ProductDetailBody } from "./_components/ProductDetailBody";
import { productStatusConfig, type ProductDetail } from "./_lib/types";

export default function ProductDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const statusConfig = productStatusConfig(t);

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
      badge={(p) => {
        const s = statusConfig[p.status] ?? statusConfig.pending;
        return (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${s.color} ${s.bg}`}
          >
            {s.label}
          </span>
        );
      }}
    >
      {(p) => <ProductDetailBody product={p} />}
    </DetailPage>
  );
}
