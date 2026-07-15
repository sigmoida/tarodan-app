/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import PaymentOptionsClient from "./_components/PaymentOptionsClient";

export function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Metadata {
  return {
    title: "Ödeme Seçenekleri · Tarodan",
    description:
      "Tarodan üzerinde kabul edilen ödeme yöntemleri, güvenli ödeme altyapısı ve taksit seçenekleri hakkında bilgi alın.",
    alternates: localizedCanonical(locale, "/payment-options"),
  };
}

export default function PaymentOptionsPage() {
  return <PaymentOptionsClient />;
}
