"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  CONSENT_CHANGED_EVENT,
  hasConsent,
  readPreferences,
} from "@/lib/cookieConsent";
import { initGoogleAdsTag } from "@/lib/googleAds";
import { isPaymentPath } from "@/lib/cspPolicy.mjs";

/**
 * gtag.js'i yalnız `marketing` rızası varken yükleyen istemci adası. Layout,
 * `NEXT_PUBLIC_GOOGLE_ADS_ID` boşsa bunu hiç render etmez — kimliksiz build
 * gemiye istemci JS'i almaz; `adsId` bu yüzden zorunlu prop'tur.
 *
 * İnline `<script>` KULLANMAZ: kuyruk kurulumunu bundle içindeki
 * `initGoogleAdsTag` yapar, DOM'a yalnız harici script eklenir. Böylece
 * nonce'suz satır içi script CSP ihlali üretmez ve `consent default` çağrısının
 * `config`'den önce gelmesi deterministik olarak garanti edilir.
 *
 * Ödeme rotalarında (isPaymentPath) arming ERTELENİR: oradaki zorlayıcı PCI
 * CSP'si Google origin'lerini bilinçli dışlar; script'i orada enjekte etmek hem
 * ihlal raporu üretir hem de `initialized` bayrağı kalıcı olduğundan etiketi
 * tüm SPA oturumu için öldürürdü. Rota değişince effect yeniden dener.
 *
 * Banner/panel kaydı `CONSENT_CHANGED_EVENT` yayar; rıza o an verildiyse tag
 * sayfa yenilenmeden yüklenir. Rıza geri çekildiğinde script kaldırılamaz ama
 * `saveConsent` Consent Mode'u "denied"a çeker ve `_gcl_*` çerezlerini siler.
 */
export default function GoogleAdsTag({ adsId }: { adsId: string }) {
  const [armed, setArmed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const arm = () => {
      if (isPaymentPath(pathname)) return;
      if (!hasConsent() || !readPreferences().marketing) return;
      initGoogleAdsTag(adsId, readPreferences());
      setArmed(true);
    };
    arm();
    window.addEventListener(CONSENT_CHANGED_EVENT, arm);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, arm);
  }, [adsId, pathname]);

  if (!armed) return null;
  return (
    <Script
      id="google-ads-gtag"
      src={`https://www.googletagmanager.com/gtag/js?id=${adsId}`}
      strategy="afterInteractive"
    />
  );
}
