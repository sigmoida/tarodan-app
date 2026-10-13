/** @format */

/**
 * Reklam yuvaları görünür mü — karar tek yerde. Admin'in üyelik katmanı
 * formundaki "reklamsız" kutusu (`isAdFree`) belirler; `GET /membership/me/limits`
 * taşır.
 *
 *  - `hidden`: reklamsız olduğu KESİNLEŞTİ (`isAdFree === true`). Afiş istenmez,
 *    çizilmez. Daha önce öğrenilmiş değer, oturum durumu yenilenirken
 *    (`checkAuth` → `isAuthLoading`) de geçerlidir: yuvalar unmount/remount olup
 *    titremez.
 *  - `visible`: misafir, reklamlı katman (`isAdFree === false`) ya da limitler
 *    okunamadı (belirsizlikte site kendi duyurusunu göstermeye devam eder).
 *  - `pending`: giriş yapmış kullanıcının katmanı henüz bilinmiyor. Afişler bu
 *    sırada PARALEL çekilir (auth + limits zincirini beklemez); yalnız
 *    çizilmez, yuva ölçüsünü korur. Reklamsız olmayan üyede limitler gelir
 *    gelmez afişler hazırdır.
 */
export type BannerVisibility = "visible" | "hidden" | "pending";

export function resolveBannerVisibility(state: {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  limitsStatus: "pending" | "error" | "success";
  /** Önbellekteki son bilinen değer; hiç öğrenilmediyse `undefined`. */
  isAdFree: boolean | undefined;
}): BannerVisibility {
  const maybeMember = state.isAuthLoading || state.isAuthenticated;
  // Kesinleşmiş reklamsızlık: oturum yenilenirken bile korunur.
  if (maybeMember && state.isAdFree === true) return "hidden";
  // Misafir (oturum durumu belli): üyeliği yok.
  if (!state.isAuthLoading && !state.isAuthenticated) return "visible";
  if (state.isAdFree === false) return "visible";
  if (state.limitsStatus === "error") return "visible";
  return "pending";
}
