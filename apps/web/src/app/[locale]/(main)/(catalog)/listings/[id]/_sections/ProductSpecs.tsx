/** @format */

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import SectionCard from "@/components/ui/SectionCard";
import { formatCondition } from "@/lib/format";
import type { Listing } from "../_lib/types";

type Translator = (key: any) => string;

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
      (a: any) => a.group === "Ölçek" || a.label === "Ölçek",
    )?.value ||
    "—";
  const materialValue =
    listing.material ||
    listing.attributes?.find(
      (a) => a.group === "material" || a.group === "Malzeme",
    )?.value ||
    "—";
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
      (a) =>
        a.group !== "scale" && a.group !== "material" && a.group !== "Malzeme",
    ) ?? [];
  const hasTechnical = technicalAttrs.length > 0 || Boolean(listing.carModel);

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
              <DetailRow label="Model" value={listing.carModel.name} />
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
