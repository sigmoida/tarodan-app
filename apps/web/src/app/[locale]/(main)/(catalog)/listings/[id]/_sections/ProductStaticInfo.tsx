import { getTranslations } from "next-intl/server";
import type { Listing } from "../_lib/types";
import ProductStaticInfoView from "./ProductStaticInfoView";

export default async function ProductStaticInfo({
  listing,
  locale,
}: {
  listing: Listing;
  locale: string;
}) {
  const t = await getTranslations();
  return <ProductStaticInfoView listing={listing} locale={locale} t={t} />;
}
