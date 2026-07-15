/** @format */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** No bare /products index — the marketplace listing lives at /listings. */
export default async function ProductsIndexPage() {
  redirect({ href: "/listings", locale: await getLocale() });
}
