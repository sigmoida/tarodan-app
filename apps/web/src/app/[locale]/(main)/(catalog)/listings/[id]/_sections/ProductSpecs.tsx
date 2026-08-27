/** @format */

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import SectionCard from "@tarodan/ui/section-card";
import { formatCondition } from "@/lib/format";
import {
  COLOR_GROUP_SLUG,
  COLOR_LABEL_SEPARATOR,
  MATERIAL_GROUP_SLUG,
  SCALE_GROUP_SLUG,
  // Alt-yol BİLEREK: bu bir sunucu bileşeni, paketin barrel'ı ise istemci
  // kartlarını (ve onların üzerinden `useState` taşıyan primitifleri) sunucu
  // zincirine sürüklüyor.
} from "@tarodan/listing-form/constants";
import type { Listing } from "../_lib/types";

type Translator = (key: any) => string;

/**
 * "Detaylar" kartında zaten kendi satırı olan gruplar — teknik listede ikinci
 * kez görünmemeleri için buradan elenir.
 *
 * Eşleşme YALNIZ slug ile: `group` grubun veritabanındaki Türkçe adıdır, yani
 * ne katalogdan gelir ne de çevrilebilir — ada göre elemek hem sabit Türkçe
 * metin gerektirirdi hem de /en yerelinde yanlış olurdu. API her nitelikte
 * `groupSlug` döndürüyor (`product-common.service`).
 */
const DERIVED_GROUP_SLUGS: string[] = [
  SCALE_GROUP_SLUG,
  MATERIAL_GROUP_SLUG,
  COLOR_GROUP_SLUG,
];

type ListingAttribute = NonNullable<Listing["attributes"]>[number];

/** Tek bir gruba ait nitelikler. */
function attributesInGroup(listing: Listing, slug: string): ListingAttribute[] {
  return (listing.attributes ?? []).filter((a) => a.groupSlug === slug);
}

/**
 * One label→value row inside the Details / Technical-details cards. Rendered as a
 * `dt`/`dd` pair so every property reads as its own line.
 */
function DetailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-heading text-right">{value}</dd>
    </div>
  );
}

/** Server-rendered product attribute and technical-detail cards. */
export default function ProductSpecs({
  listing,
  locale,
  t,
}: {
  listing: Listing;
  locale: string;
  t: Translator;
}) {
  const available =
    listing.availableQuantity !== undefined &&
    listing.availableQuantity !== null
      ? listing.availableQuantity
      : listing.quantity;

  // Scale/material fall back to a matching attribute when the field is empty.
  const scaleValue =
    listing.scale ||
    listing.attributes?.find(
      (a: any) =>
        // Nitelik grup/etiketleri katalog VERİSİDİR (DB'den Türkçe gelir),
        // arayüz kopyası değil — çeviriye bağlanamaz.
        /* eslint-disable-next-line @tarodan/no-hardcoded-turkish */
        a.group === "Ölçek" ||
        /* eslint-disable-next-line @tarodan/no-hardcoded-turkish */
        a.label === "Ölçek",
    )?.value ||
    "—";
  const materialValue =
    listing.material ||
    listing.attributes?.find(
      (a) => a.group === "material" || a.group === "Malzeme",
    )?.value ||
    "—";
  /**
   * Renk aynı mantıkla türetilir: `products.color` denormalize kolonu boşsa
   * (backfill görmemiş eski ilan) nitelikler üzerinden okunur. Türetim burada
   * yapılmasa, aşağıda renk grubunu teknik listeden düşürmek o ilanlarda rengi
   * tamamen görünmez kılardı.
   */
  const colorValue =
    listing.color ||
    attributesInGroup(listing, COLOR_GROUP_SLUG)
      .map((a) => a.value)
      .join(COLOR_LABEL_SEPARATOR) ||
    null;
  const hasQuantity =
    (listing.availableQuantity !== undefined &&
      listing.availableQuantity !== null) ||
    (listing.quantity !== undefined && listing.quantity !== null);
  const stockValue =
    available === null || available === undefined
      ? t("membership.unlimited")
      : available > 0
        ? `${available} ${t("product.available")}`
        : t("product.stockFinished");

  const infoRows: Array<{ label: string; value: ReactNode }> = [];
  // İlan numarası: destek/şikayet başvurularında kullanıcıdan bu istenir.
  if (listing.productCode) {
    infoRows.push({
      label: t("product.productCode"),
      value: listing.productCode,
    });
  }
  if (listing.brand) {
    infoRows.push({
      label: t("product.brand"),
      value: (
        <Link
          href={`/manufacturers/${listing.brand.slug}`}
          className="hover:text-primary-500 transition-colors"
        >
          {listing.brand.name}
        </Link>
      ),
    });
  }
  infoRows.push({ label: t("product.scale"), value: scaleValue });
  infoRows.push({
    label: t("product.material"),
    value: materialValue,
  });
  if (listing.manufacturer) {
    infoRows.push({
      label: t("product.manufacturer"),
      value: listing.manufacturer.name,
    });
  }
  if (listing.category) {
    infoRows.push({
      label: t("product.category"),
      value: listing.category.name,
    });
  }
  if (listing.condition) {
    infoRows.push({
      label: t("product.condition"),
      value: formatCondition(listing.condition, locale),
    });
  }
  infoRows.push({
    label: t("product.year"),
    value: listing.year ?? "—",
  });
  if (hasQuantity) {
    infoRows.push({
      label: t("product.stock"),
      value: stockValue,
    });
  }

  const technicalAttrs =
    listing.attributes?.filter(
      (a) => !DERIVED_GROUP_SLUGS.includes(a.groupSlug ?? ""),
    ) ?? [];
  const hasTechnical =
    technicalAttrs.length > 0 ||
    Boolean(listing.carModel) ||
    Boolean(listing.modelCode) ||
    Boolean(colorValue) ||
    listing.isBoxed != null;

  return (
    <div
      className={`grid gap-6 ${hasTechnical ? "md:grid-cols-2" : "grid-cols-1"}`}
    >
      {/* Details — brand / scale / material / … row by row */}
      <SectionCard title={t("product.detailsSection")}>
        <dl className="divide-y divide-border">
          {infoRows.map((row) => (
            <DetailRow key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
      </SectionCard>

      {/* Technical details — its own card, row by row */}
      {hasTechnical && (
        <SectionCard title={t("product.technicalDetails")}>
          <dl className="divide-y divide-border">
            {listing.carModel && (
              <DetailRow
                label={t("product.model")}
                value={listing.carModel.name}
              />
            )}
            {listing.modelCode && (
              <DetailRow
                label={t("product.modelCode")}
                value={listing.modelCode}
              />
            )}
            {colorValue && (
              <DetailRow label={t("product.color")} value={colorValue} />
            )}
            {listing.isBoxed != null && (
              <DetailRow
                label={t("product.boxedCondition")}
                value={
                  listing.isBoxed ? t("product.boxed") : t("product.unboxed")
                }
              />
            )}
            {technicalAttrs.map((attr) => (
              <DetailRow key={attr.id} label={attr.label} value={attr.value} />
            ))}
          </dl>
        </SectionCard>
      )}
    </div>
  );
}
