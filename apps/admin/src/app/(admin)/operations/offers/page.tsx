import { redirect } from "next/navigation";
import { ordersTabHref } from "../orders/_lib/screenTabs";

/**
 * Teklifler listesi artık "Siparişler" ekranının Teklifler sekmesi — eski
 * adres (yer imleri, ürün/kullanıcı deep-link'leri) filtreleriyle birlikte
 * yönlenir. Teklif DOSYASI (`/operations/offers/[id]`) yerinde durur.
 */
export default async function OffersRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(ordersTabHref("offers", await searchParams));
}
