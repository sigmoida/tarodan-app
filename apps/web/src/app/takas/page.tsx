import { redirect } from "next/navigation";

// /takas → mevcut listeleme sayfasının takas filtresine yönlendirir (temiz, paylaşılabilir URL).
// Tüm filtre/sıralama/sayfalama/rozet /listings'ten gelir; kod tekrarı yok.
export default function TakasPage() {
  redirect("/listings?tradeOnly=true");
}
