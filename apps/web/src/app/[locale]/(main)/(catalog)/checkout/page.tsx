import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function CheckoutPage() {
  redirect({ href: "/cart/payment", locale: await getLocale() });
}
