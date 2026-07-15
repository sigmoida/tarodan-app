/** @format */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** /products/unavailable needs a product id; without one, go to the listings. */
export default async function UnavailableIndexPage() {
  redirect({ href: "/listings", locale: await getLocale() });
}
