import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { isEmbedPath } from "@/lib/embed";

/**
 * i18n yönlendirmesi (#214) — iki kip:
 *
 *  - **Siteyi gezen ziyaretçi** (varsayılan): `NEXT_LOCALE` çerezi ve
 *    `Accept-Language` ile dil tespit edilir; öneksiz yol İngilizce tercih
 *    eden birini `/en/...`'e yönlendirir.
 *  - **Embed (`/app/**`, mobil WebView)**: tespit KAPALI. Dil yalnız yoldan
 *    gelir (öneksiz = tr, `/en` = en); cihaz/oturum diline göre yönlendirme
 *    yapılmaz — uygulama hangi dili isterse o yolu açar. Tespit kapalıyken
 *    `NEXT_LOCALE` çerezi de yazılmaz (WebView çerezi tarayıcıyla paylaşıyorsa
 *    kullanıcının site dil tercihi ezilmez). Noindex sayfalar olduğu için
 *    hreflang `Link` başlığı da üretilmez.
 */
const siteMiddleware = createIntlMiddleware(routing);
const embedMiddleware = createIntlMiddleware(routing, {
  localeDetection: false,
  alternateLinks: false,
});

/** `rest`: locale öneki çıkarılmış yol (middleware'in `splitLocale` sonucu). */
export function localeMiddleware(
  request: NextRequest,
  rest: string,
): NextResponse {
  return (isEmbedPath(rest) ? embedMiddleware : siteMiddleware)(request);
}
