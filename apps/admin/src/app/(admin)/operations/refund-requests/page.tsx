import { redirect } from "next/navigation";
import { refundsViewHref } from "../cancellations-refunds/_lib/view";

/**
 * İade talepleri listesi artık "İptal & İade" ekranının İadeler sekmesi —
 * eski adres (yer imleri, eski bildirim linkleri) filtreleriyle birlikte
 * yönlenir. Talep DOSYASI (`/operations/refund-requests/[id]`) yerinde durur.
 */
export default async function RefundRequestsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(refundsViewHref(await searchParams));
}
