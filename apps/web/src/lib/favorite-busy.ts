/** @format */

/**
 * Favori isteği sürerken kalp / "favorilerden kaldır" düğmesine verilenler.
 * Kart kalbi, ilan detayı kalbi ve Favorilerim aynı görünümü buradan alır.
 *
 * Native `disabled` BİLEREK kullanılmaz: `@tarodan/ui` IconButton onu
 * `pointer-events-none` yapar ve kart kalbinde tıklama alttaki ürün linkine
 * düşüp sayfayı değiştirirdi. İkinci tıklamayı `useToggleWishlist` zaten yok
 * sayar; burada yalnız erişilebilirlik ve görünüm var.
 */

/** Görünüm: meşgulken soluk + bekleme imleci (yalnız `aria-busy` iken). */
export const FAVORITE_BUSY_CLASS =
  "aria-busy:cursor-progress aria-busy:opacity-60";

export function favoriteBusyProps(isPending: boolean) {
  return isPending
    ? ({ "aria-busy": true, "aria-disabled": true } as const)
    : {};
}
