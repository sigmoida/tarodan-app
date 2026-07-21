"use client";

import { Badge, productConditionConfig, enumLabel } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/product-price";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { aiCheckConfig, aiCheckKey } from "../../_lib/types";
import type { ProductDetail } from "../_lib/types";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-sm text-muted">{label}</span>
      <div className="mt-0.5 font-medium text-heading">{children}</div>
    </div>
  );
}

export function ProductInfoSection({ product }: { product: ProductDetail }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.catalog.products.infoTab")}
      bodyClassName="space-y-3"
    >
      <Row label={t("common.title")}>{product.title}</Row>
      <div>
        <span className="text-sm text-muted">{t("common.description")}</span>
        <p className="mt-1 whitespace-pre-wrap text-body">
          {product.description}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
        <div>
          <span className="text-sm text-muted">{t("common.price")}</span>
          {isProductOnSaleDisplay(product) && (
            <p className="text-base text-muted line-through">
              {fmtTry(getProductOriginalPriceForDisplay(product))}
            </p>
          )}
          <p className="text-lg font-semibold text-heading">
            {fmtTry(getProductEffectivePrice(product))}
          </p>
        </div>
        <Row label={t("admin.catalog.products.condition")}>
          {enumLabel(productConditionConfig, product.condition)}
        </Row>
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
        <Row label={t("admin.catalog.products.viewCount")}>
          {product.viewCount || 0}
        </Row>
        <div>
          <span className="text-sm text-muted">
            {t("admin.catalog.products.createdAt")}
          </span>
          <p className="mt-0.5 text-sm text-body">
            {fmtDateTime(product.createdAt)}
          </p>
        </div>
      </div>
      <div className="border-t border-border pt-3">
        <Row label={t("admin.catalog.products.stock")}>
          {product.quantity !== undefined
            ? product.quantity
            : t("admin.catalog.products.notSpecified")}
        </Row>
      </div>
      {product.rejectionReason && (
        <div className="border-t border-border pt-3">
          <div className="rounded-lg border border-danger-200 bg-danger-50 p-3">
            <p className="text-sm text-danger-800">
              <strong>
                {t("admin.catalog.products.rejectionReasonLabel")}
              </strong>{" "}
              {product.rejectionReason}
            </p>
          </div>
        </div>
      )}
      {product.aiCheckStatus && (
        <div className="border-t border-border pt-3">
          <span className="text-sm text-muted">
            {t("admin.catalog.products.aiImageCheck")}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              status={aiCheckKey(product.aiCheckStatus)}
              config={aiCheckConfig(t)}
            />
            <span className="text-xs text-muted">
              {t("admin.catalog.products.aiScores", {
                relevance: Math.round((product.aiRelevanceScore ?? 0) * 100),
                nsfw: ((product.aiNsfwScore ?? 0) * 100).toFixed(2),
              })}
            </span>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
