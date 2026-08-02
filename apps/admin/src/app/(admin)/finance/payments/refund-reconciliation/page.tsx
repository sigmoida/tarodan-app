import { redirect } from "next/navigation";

/** İade mutabakatı artık Ödemeler sayfasının sekmesi — eski URL yönlendirir. */
export default function RefundReconciliationRedirect() {
  redirect("/finance/payments?tab=reconciliation");
}
