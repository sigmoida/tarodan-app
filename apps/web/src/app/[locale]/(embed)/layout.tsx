/** @format */

import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

/**
 * Mobil uygulamanın WebView'de açtığı "uygulama modu" sayfalarının düzeni.
 * Vitrin kromu YOK: başlık, alt bilgi, reklam çubuğu, zorunlu adım kapısı,
 * üyelik/adres kapıları ve gerçek zamanlı bağlantı bu grupta bağlanmaz (hepsi
 * `(main)/layout`ta). Sayfalar herkese açıktır; oturum gerekmez.
 *
 * Kök `[locale]/layout` çerez bandı ve Ads etiketini bu yollarda çizmez
 * (`HideInEmbed`). Yasal metinler arama motoruna da açılmaz: asıl yüzey
 * normal sitedeki sayfalardır.
 *
 * `<main>` çentik/ana ekran çizgisi paylarını `env(safe-area-inset-*)` ile
 * bırakır (kök viewport `cover` — içerik kenardan kenara uzanır). Hiçbir
 * sağlayıcı gerekmez: metin sunucuda çizilir, çeviri bağlamı kökten gelir.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
    </main>
  );
}
