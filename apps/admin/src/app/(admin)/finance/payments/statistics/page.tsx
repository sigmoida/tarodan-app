import { redirect } from "next/navigation";

/** İstatistik artık Ödemeler sayfasının sekmesi — eski URL yönlendirir. */
export default function PaymentStatisticsRedirect() {
  redirect("/finance/payments?tab=statistics");
}
