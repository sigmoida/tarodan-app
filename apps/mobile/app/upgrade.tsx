import { Redirect } from 'expo-router';

// Statik fiyatlı (yalnız Premium ₺99/₺990) eski yükseltme ekranı kaldırıldı;
// ₺990 yıllık fiyatı DB'deki ₺959.99 ile uyumsuzdu. Tüm premium feature-gate'leri
// artık tek kanonik `/membership` ekranına yönlendiriyor (fiyatlar DB
// MembershipTier'dan, backend tahsilatı + web ile birebir aynı). Web'de ayrı bir
// /upgrade ekranı yok; her yol /profile/membership'e çıkıyor (parite).
export default function UpgradeRedirect() {
  return <Redirect href="/membership" />;
}
