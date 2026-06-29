import { Redirect } from 'expo-router';

// Statik fiyatlı eski paket ekranı kaldırıldı (Business ₺199 gibi DB ile uyumsuz
// hardcoded fiyatlar gösteriyordu). Tek kanonik üyelik ekranı artık `/membership`
// (fiyatlar DB MembershipTier'dan, backend tahsilatı + web ile birebir aynı).
// Web'de de /pricing → /profile/membership redirect'i var (parite).
export default function PricingRedirect() {
  return <Redirect href="/membership" />;
}
