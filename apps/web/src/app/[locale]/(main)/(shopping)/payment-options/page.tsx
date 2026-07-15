/** @format */

import type { Metadata } from "next";
import PaymentOptionsClient from "./_components/PaymentOptionsClient";

export const metadata: Metadata = {
  title: "Ödeme Seçenekleri · Tarodan",
  description:
    "Tarodan üzerinde kabul edilen ödeme yöntemleri, güvenli ödeme altyapısı ve taksit seçenekleri hakkında bilgi alın.",
  alternates: { canonical: "/payment-options" },
};

export default function PaymentOptionsPage() {
  return <PaymentOptionsClient />;
}
