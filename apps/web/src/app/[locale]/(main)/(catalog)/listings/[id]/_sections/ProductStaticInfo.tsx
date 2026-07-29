import { getTranslations } from "next-intl/server";
import type { Listing } from "../_lib/types";
import ProductStaticInfoView from "./ProductStaticInfoView";

export default async function ProductStaticInfo({
  listing,
}: {
  listing: Listing;
}) {
  const t = await getTranslations();
  return <ProductStaticInfoView listing={listing} t={t} />;
}
