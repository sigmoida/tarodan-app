/**
 * Misafir (guest) ödeme akışı işaretleyicisi.
 *
 * Problem: Misafir PayTR'a gidip döndüğünde guest-lik bilgisi yalnızca URL'deki
 * `guest=true` param'ına bağlıydı. Param kaybolduğunda (hidrasyon yarışı, PayTR'ın
 * fail URL'inde bayrak olmaması, vb.) ödeme sayfaları kullanıcıyı /login'e atıyordu.
 *
 * Çözüm: Misafir ödeme başlatıldığında sessionStorage'a kalıcı bir işaret koyuyoruz.
 * sessionStorage seçimi bilinçli — sekme/oturum ömründe yaşar (PayTR'a tam-sayfa
 * gidip dönmede korunur), sekme kapanınca temizlenir ve sonraki authenticated
 * oturuma sızmaz.
 */

export const GUEST_CHECKOUT_KEY = 'tarodan_guest_checkout';

/** Misafir ödeme başladı işaretle (checkout'ta, yalnız oturumsuz kullanıcı için). */
export function markGuestCheckout(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(GUEST_CHECKOUT_KEY, '1');
  } catch {
    /* sessionStorage erişilemezse sessizce geç */
  }
}

/** İşareti temizle (ödeme başarı/başarısızlık ile akış bittiğinde). */
export function clearGuestCheckout(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(GUEST_CHECKOUT_KEY);
  } catch {
    /* yok say */
  }
}

/** Bu sekmede misafir ödeme işareti var mı? */
export function hasGuestCheckoutMarker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(GUEST_CHECKOUT_KEY) === '1';
  } catch {
    return false;
  }
}

/** URL'de `guest=true` param'ı var mı? (searchParams hidrasyon gecikmesine karşı doğrudan window'dan okur.) */
export function isGuestFromUrl(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.location.search.includes('guest=true')
  );
}
