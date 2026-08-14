"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CubeIcon, StarIcon } from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminTabs } from "@/components/AdminTabs";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { ProductDetail, Review } from "../_lib/types";
import { ProductImagesSection } from "../_sections/ProductImagesSection";
import { ProductInfoSection } from "../_sections/ProductInfoSection";
import { ProductSellerSection } from "../_sections/ProductSellerSection";
import { ProductSidebar } from "../_sections/ProductSidebar";
import { ProductReviewsSection } from "../_sections/ProductReviewsSection";
import { ProductApproveModal } from "../_modals/ProductApproveModal";
import { ProductRejectModal } from "../_modals/ProductRejectModal";

type Tab = "info" | "reviews" | "ai";

export function ProductDetailBody({ product }: { product: ProductDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("info");
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: adminKeys.detail("product-reviews", product.id),
    queryFn: async () =>
      (await adminApi.getReviews({ productId: product.id, limit: 50 })).data
        .data ?? [],
  });
  const reviewCount = reviews.filter((r) => r.status !== "deleted").length;

  const del = useAdminMutation(() => adminApi.deleteProduct(product.id), {
    invalidates: ["products"],
    successMessage: t("admin.catalog.products.removed"),
    onSuccess: () => router.push("/catalog/products"),
  });
  const restore = useAdminMutation(() => adminApi.restoreProduct(product.id), {
    invalidates: ["products"],
    successMessage: t("admin.catalog.products.restored"),
  });

  const onDelete = async () => {
    await confirm({
      title: t("admin.catalog.products.removeTitle"),
      description: t("admin.catalog.products.removeDescription"),
      confirmLabel: t("common.remove"),
      destructive: true,
      onConfirm: () => del.mutateAsync(),
    });
  };
  const onRestore = async () => {
    await confirm({
      title: t("admin.catalog.products.restoreTitle"),
      description: t("admin.catalog.products.restoreDescription"),
      confirmLabel: t("admin.catalog.products.restore"),
      onConfirm: () => restore.mutateAsync(),
    });
  };

  return (
    <>
      <AdminTabs
        tabs={[
          {
            key: "info",
            label: t("admin.catalog.products.infoTab"),
            icon: CubeIcon,
          },
          {
            key: "reviews",
            label: t("admin.catalog.products.reviewsTab"),
            icon: StarIcon,
            badge: reviewCount,
          },
          { key: "ai", label: t("admin.catalog.common.aiModeration") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === "info" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ProductImagesSection product={product} />
            <ProductInfoSection product={product} />
            <ProductSellerSection seller={product.seller} />
          </div>
          <div className="space-y-6">
            <ProductSidebar
              product={product}
              onApprove={() => setApproveOpen(true)}
              onReject={() => setRejectOpen(true)}
              onRestore={onRestore}
              onDelete={onDelete}
              busyRestore={restore.isPending}
              busyDelete={del.isPending}
            />
          </div>
        </div>
      )}

      {tab === "reviews" && (
        <ProductReviewsSection productId={product.id} reviews={reviews} />
      )}

      {tab === "ai" && (
        <ModerationEventsPanel
          entityType="product"
          entityId={product.id}
          title={t("admin.catalog.common.aiModeration")}
          description={t("admin.catalog.products.aiPanelDescription")}
        />
      )}

      <ProductApproveModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        productId={product.id}
      />
      <ProductRejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        productId={product.id}
      />
    </>
  );
}
