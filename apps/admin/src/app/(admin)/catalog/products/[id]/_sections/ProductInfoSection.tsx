"use client";

import {
  Alert,
  Badge,
  Button,
  Select,
  productConditionConfig,
  enumLabel,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import { adminApi } from "@/lib/api";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/product-price";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { aiCheckConfig, aiCheckKey } from "../../_lib/types";
import {
  PACKAGE_TIER_OPTIONS,
  type PackageTierCode,
  type ProductDetail,
} from "../_lib/types";
import { statusConfig } from "@/lib/statusLabels";
import {
  isDedicatedAttributeGroup,
  isHiddenAttributeGroup,
} from "@tarodan/types";

export function ProductInfoSection({ product }: { product: ProductDetail }) {
  const t = useTranslations();
  // Moderasyon: satıcı yanlış boyut seçtiğinde (buzdolabına "Küçük Paket") kargo
  // farkını platform üstlenir, çünkü Sürat faturası platforma gelir. Admin düzeltir;
  // desi kademeden türetilir ve düzeltme denetim kaydına düşer.
  const [packageTier, setPackageTier] = useState<PackageTierCode>(
    product.shippingPackageTier ?? "small",
  );
  const savePackageTier = useAdminMutation(
    () =>
      adminApi.updateProduct(product.id, {
        shippingPackageTier: packageTier,
      }),
    {
      invalidates: ["products"],
      successMessage: t("admin.catalog.products.packageTierUpdated"),
    },
  );

  return (
    <SectionCard
      title={t("admin.catalog.products.infoTab")}
      bodyClassName="space-y-3"
    >
      <DataList columns={1}>
        <Field layout="stacked" label={t("common.title")}>
          {product.title}
        </Field>
        <Field layout="stacked" label={t("common.description")}>
          <p className="whitespace-pre-wrap font-normal text-body">
            {product.description}
          </p>
        </Field>
      </DataList>
      <DataList className="border-t border-border pt-3">
        <Field layout="stacked" label={t("common.price")}>
          {isProductOnSaleDisplay(product) && (
            <p className="text-base text-muted line-through">
              {fmtTry(getProductOriginalPriceForDisplay(product))}
            </p>
          )}
          <p className="text-lg font-semibold text-heading">
            {fmtTry(getProductEffectivePrice(product))}
          </p>
        </Field>
        <Field layout="stacked" label={t("admin.catalog.products.condition")}>
          {enumLabel(
            statusConfig(productConditionConfig, t),
            product.condition,
          )}
        </Field>
      </DataList>
      <DataList className="border-t border-border pt-3">
        <Field layout="stacked" label={t("product.productCode")}>
          {product.productCode}
        </Field>
        <Field layout="stacked" label={t("product.brand")}>
          {product.brand?.name ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.model")}>
          {product.carModel?.name ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.modelCode")}>
          {product.modelCode ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.color")}>
          {product.color ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.scale")}>
          {product.scale ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.material")}>
          {product.material ?? t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.manufacturer")}>
          {product.manufacturer?.name ??
            t("admin.catalog.products.notSpecified")}
        </Field>
        <Field layout="stacked" label={t("product.boxedCondition")}>
          {product.isBoxed == null
            ? t("admin.catalog.products.notSpecified")
            : product.isBoxed
              ? t("product.boxed")
              : t("product.unboxed")}
        </Field>
        {/* Özel grup seçimleri (genel + üreticiye bağlı); sabit üçlü yukarıda. */}
        {(product.edit?.attributes ?? [])
          .filter(
            (attribute) =>
              !isDedicatedAttributeGroup(attribute.groupSlug) &&
              !isHiddenAttributeGroup(attribute.groupSlug),
          )
          .map((attribute) => (
            <Field
              layout="stacked"
              key={`${attribute.groupSlug}:${attribute.slug}`}
              label={attribute.groupName ?? attribute.groupSlug}
            >
              {attribute.displayValue ?? attribute.value ?? attribute.slug}
            </Field>
          ))}
      </DataList>
      <DataList className="border-t border-border pt-3">
        <Field layout="stacked" label={t("admin.catalog.products.viewCount")}>
          {product.viewCount || 0}
        </Field>
        <Field layout="stacked" label={t("admin.catalog.products.createdAt")}>
          {fmtDateTime(product.createdAt)}
        </Field>
      </DataList>
      <DataList columns={1} className="border-t border-border pt-3">
        <Field layout="stacked" label={t("admin.catalog.products.stock")}>
          {product.quantity !== undefined
            ? product.quantity
            : t("admin.catalog.products.notSpecified")}
        </Field>
      </DataList>
      <div className="border-t border-border pt-3">
        <label
          htmlFor="admin-product-package-tier"
          className="text-sm text-muted"
        >
          {t("admin.catalog.products.packageTier")}
        </label>
        <div className="mt-1 flex max-w-sm items-center gap-2">
          <Select
            id="admin-product-package-tier"
            value={packageTier}
            onChange={(event) =>
              setPackageTier(event.target.value as PackageTierCode)
            }
            options={PACKAGE_TIER_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
          <Button
            size="sm"
            isLoading={savePackageTier.isPending}
            disabled={packageTier === (product.shippingPackageTier ?? "small")}
            onClick={() => savePackageTier.mutate()}
          >
            {t("common.save")}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {t("admin.catalog.products.packageTierHelper", {
            desi: product.shippingDesi ?? 1,
          })}
        </p>
      </div>
      {product.rejectionReason && (
        <div className="border-t border-border pt-3">
          <Alert variant="danger">
            <strong>{t("admin.catalog.products.rejectionReasonLabel")}</strong>{" "}
            {product.rejectionReason}
          </Alert>
        </div>
      )}
      {product.aiCheckStatus && (
        <div className="border-t border-border pt-3">
          <DataList columns={1}>
            <Field
              layout="stacked"
              label={t("admin.catalog.products.aiImageCheck")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  status={aiCheckKey(product.aiCheckStatus)}
                  config={aiCheckConfig(t)}
                />
                <span className="text-xs font-normal text-muted">
                  {t("admin.catalog.products.aiScores", {
                    relevance: Math.round(
                      (product.aiRelevanceScore ?? 0) * 100,
                    ),
                    nsfw: ((product.aiNsfwScore ?? 0) * 100).toFixed(2),
                  })}
                </span>
              </div>
            </Field>
          </DataList>
        </div>
      )}
    </SectionCard>
  );
}
