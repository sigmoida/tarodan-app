"use client";

import { useLocale, useTranslations } from "next-intl";
import { useListingDetail } from "../_context/ListingDetailContext";
import ProductSpecs from "./ProductSpecs";

/** Client fallback for the spec cards when the server product fetch returned
 *  null (pending / owner-only listings). Mirrors ProductStaticInfoFallback. */
export default function ProductSpecsFallback() {
  const t = useTranslations();
  const locale = useLocale();
  const { listing } = useListingDetail();

  if (!listing) return null;
  return <ProductSpecs listing={listing} locale={locale} t={t} />;
}
