"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminTabs } from "@/components/AdminTabs";
import { DetailLayout } from "@/components/detail/DetailLayout";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import type { ProductDetail, Review } from "../_lib/types";
import { ProductImagesSection } from "../_sections/ProductImagesSection";
import { ProductInfoSection } from "../_sections/ProductInfoSection";
import { ProductSellerSection } from "../_sections/ProductSellerSection";
import { ProductSidebar } from "../_sections/ProductSidebar";
import { ProductReviewsSection } from "../_sections/ProductReviewsSection";
import { ProductRemovalSection } from "../_sections/ProductRemovalSection";
import { ProductApproveModal } from "../_modals/ProductApproveModal";
import { ProductRejectModal } from "../_modals/ProductRejectModal";
import { ProductRemoveModal } from "../_modals/ProductRemoveModal";

type Tab = "info" | "reviews" | "ai";

export function ProductDetailBody({ product }: { product: ProductDetail }) {
  const t = useTranslations();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("info");
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Kaldırma bir onay değil, bir FORM: ihlal kodu + açıklama kayda geçer.
  const [removeOpen, setRemoveOpen] = useState(false);

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: adminKeys.detail("product-reviews", product.id),
    queryFn: async () =>
      (await adminApi.getReviews({ productId: product.id, limit: 50 })).data
        .data ?? [],
  });
  const reviewCount = reviews.filter((r) => r.status !== "deleted").length;

  const restore = useAdminMutation(() => adminApi.restoreProduct(product.id), {
    invalidates: ["products"],
    successMessage: t("admin.catalog.products.restored"),
  });

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
          },
          {
            key: "reviews",
            label: t("admin.catalog.products.reviewsTab"),
            badge: reviewCount,
          },
          { key: "ai", label: t("admin.catalog.common.aiModeration") },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {tab === "info" && (
        <DetailLayout
          main={
            <>
              <ProductImagesSection product={product} />
              <ProductInfoSection product={product} />
              <ProductSellerSection seller={product.seller} />
              <ProductRemovalSection history={product.removalHistory ?? []} />
            </>
          }
          aside={
            <ProductSidebar
              product={product}
              onApprove={() => setApproveOpen(true)}
              onReject={() => setRejectOpen(true)}
              onRestore={onRestore}
              onDelete={() => setRemoveOpen(true)}
              busyRestore={restore.isPending}
            />
          }
        />
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
      {removeOpen && (
        <ProductRemoveModal
          open
          onClose={() => setRemoveOpen(false)}
          productId={product.id}
        />
      )}
    </>
  );
}
