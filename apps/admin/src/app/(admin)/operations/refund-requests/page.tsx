import { redirect } from "next/navigation";
import { refundsHref } from "../refunds/_lib/screenTabs";

/**
 * İade talepleri listesi artık "İadeler" ekranı — eski adres (yer imleri,
 * eski bildirim linkleri) filtreleriyle birlikte yönlenir (`status` alt
 * sekmeye, `from`/`to` tarih aralığına çevrilir). Talep DOSYASI
 * (`/operations/refund-requests/[id]`) yerinde durur.
 */
export default async function RefundRequestsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(refundsHref(await searchParams));
}
