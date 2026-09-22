import { redirect } from "next/navigation";
import { ordersTabHref } from "../orders/_lib/screenTabs";

/**
 * Takaslar listesi artık "Siparişler" ekranının Takaslar sekmesi — eski adres
 * (yer imleri, kullanıcı deep-link'i, eski bildirim/pano linkleri)
 * filtreleriyle birlikte yönlenir. Takas DOSYASI (`/operations/trades/[id]`)
 * yerinde ve `trades` izniyle korunmaya devam eder.
 */
export default async function TradesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(ordersTabHref("trades", await searchParams));
}
