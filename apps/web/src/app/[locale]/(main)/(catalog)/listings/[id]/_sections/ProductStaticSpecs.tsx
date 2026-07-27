import { getTranslations } from "next-intl/server";
import type { Listing } from "../_lib/types";
import ProductSpecs from "./ProductSpecs";

/** Server wrapper so the spec cards ship in the crawlable HTML. */
export default async function ProductStaticSpecs({
  listing,
  locale,
}: {
  listing: Listing;
  locale: string;
}) {
  const t = await getTranslations();
  return <ProductSpecs listing={listing} locale={locale} t={t} />;
}
