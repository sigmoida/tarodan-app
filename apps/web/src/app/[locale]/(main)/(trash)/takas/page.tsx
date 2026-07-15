import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// /takas → mevcut listeleme sayfasının takas filtresine yönlendirir (temiz, paylaşılabilir URL).
// Tüm filtre/sıralama/sayfalama/rozet /listings'ten gelir; kod tekrarı yok.
export default async function TakasPage() {
  redirect({ href: "/listings?tradeOnly=true", locale: await getLocale() });
}
