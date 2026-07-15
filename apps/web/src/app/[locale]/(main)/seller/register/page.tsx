/** @format */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/** Seller registration = business/company signup — handled by /register/business. */
export default async function SellerRegisterPage() {
  redirect({ href: "/register/business", locale: await getLocale() });
}
