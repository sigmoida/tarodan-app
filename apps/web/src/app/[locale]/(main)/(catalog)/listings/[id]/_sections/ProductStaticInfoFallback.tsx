"use client";

import { useTranslations } from "next-intl";
import { useListingDetail } from "../_context/ListingDetailContext";
import ProductStaticInfoView from "./ProductStaticInfoView";

export default function ProductStaticInfoFallback() {
  const t = useTranslations();
  const { listing } = useListingDetail();

  if (!listing) return null;
  return <ProductStaticInfoView listing={listing} t={t} />;
}
