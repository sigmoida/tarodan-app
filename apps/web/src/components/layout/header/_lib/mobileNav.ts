/** @format */

import { shouldShowCategoryBar } from "./categoryBar";

export type MobileNavVariant = "catalog" | "profile";

const PROFILE_PREFIX = "/profile";

/**
 * Küçük ekranda hamburger hangi gezinmeyi açar?
 *
 * TEK KAYNAK: hem düğmenin görünüp görünmeyeceğini hem hangi çekmecenin
 * bağlanacağını bu belirler. İkisi ayrı yerde hesaplanırsa düğmenin hiçbir
 * çekmecesi olmayan bir yolda görünmesi (tıklayınca hiçbir şey olmaz) kaçınılmaz
 * olurdu.
 *
 * `/profile/*` katalog gezinmesini değil hesap gezinmesini açar — kategori barı
 * o yollarda zaten görünmüyor, ama sıra önemli: profil kontrolü önce gelir.
 */
export function mobileNavVariant(pathname: string): MobileNavVariant | null {
  if (
    pathname === PROFILE_PREFIX ||
    pathname.startsWith(`${PROFILE_PREFIX}/`)
  ) {
    return "profile";
  }
  return shouldShowCategoryBar(pathname) ? "catalog" : null;
}
