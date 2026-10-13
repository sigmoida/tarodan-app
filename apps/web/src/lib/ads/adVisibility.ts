/** @format */

/**
 * Banner gösterilsin mi — karar tek yerde. Admin'in üyelik katmanı formundaki
 * "reklamsız" kutusu (`isAdFree`) belirler; `GET /membership/me/limits` taşır.
 *
 *  - Misafir: banner görünür (üyeliği yok).
 *  - Oturum durumu henüz belli değil, ya da giriş yapmış kullanıcının limitleri
 *    henüz gelmedi: banner BEKLER. Aksi halde reklamsız üye her sayfada bir an
 *    reklam görür ve afiş isteği boşuna atılırdı.
 *  - Limitler okunamadı (hata): banner görünür. Reklamsızlık bir ayrıcalık;
 *    belirsizlikte site kendi duyurusunu göstermeye devam eder.
 *  - Aksi halde katmanın `isAdFree` değeri: `true` ise banner çizilmez.
 */
export function shouldShowBanner(state: {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  limitsStatus: "pending" | "error" | "success";
  isAdFree: boolean;
}): boolean {
  if (state.isAuthLoading) return false;
  if (!state.isAuthenticated) return true;
  if (state.limitsStatus === "pending") return false;
  if (state.limitsStatus === "error") return true;
  return !state.isAdFree;
}
