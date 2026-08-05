/** @format */

"use client";

import CardPaymentSection from "@/components/payment/CardPaymentSection";
import { useCheckout } from "../_context/CheckoutContext";

/**
 * Kart bilgileri — ödeme sayfasıyla AYNI bileşen. Gönder düğmesi burada değil,
 * sipariş özetinin içinde: kullanıcı tutarı gördüğü yerden onaylar (sözleşme
 * onayı da orada).
 */
export default function PaymentSection() {
  const { t, card } = useCheckout();
  return <CardPaymentSection card={card} title={t("checkout.cardSection")} />;
}
