"use client";

import { useLocale, useTranslations } from "next-intl";
import { useListingDetail } from "../_context/ListingDetailContext";
import ProductStaticInfoView from "./ProductStaticInfoView";

export default function ProductStaticInfoFallback() {
  const t = useTranslations();
  const locale = useLocale();
  const { listing } = useListingDetail();

  if (!listing) return null;
  return <ProductStaticInfoView listing={listing} locale={locale} t={t} />;
}
