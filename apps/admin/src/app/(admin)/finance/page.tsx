import { redirect } from "next/navigation";

/**
 * Finance is a section shell with no page of its own — entering it (via the
 * sidebar or a direct URL) redirects to the overview child route, which shows
 * the money-flow funnel + health counters.
 */
export default function FinancePage() {
  redirect("/finance/overview");
}
