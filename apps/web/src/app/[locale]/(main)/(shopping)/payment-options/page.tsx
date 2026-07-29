/** @format */

import type { Metadata } from "next";
import { localizedCanonical } from "@/lib/seo";
import PaymentOptionsClient from "./_components/PaymentOptionsClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
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
