/** @format */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

/**
 * /payment has no standalone view — payments are always scoped to a specific
 * payment id (/payment/[id]). Hitting the bare route redirects home.
 */
export default async function PaymentIndexPage() {
  redirect({ href: "/", locale: await getLocale() });
}
