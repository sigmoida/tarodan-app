/** @format */

"use client";

import { useRef, useState } from "react";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdImpression } from "@/hooks/useAdImpression";
import { trackAdEvent, type Advertisement } from "@/lib/api/advertisements";
import { isExternalAdHref, safeAdHref } from "@/lib/ads/safeAdHref";
import AdHotspots from "@/components/marketing/AdHotspots";
import { Container } from "../Container";

/**
 * Üst şeridin tek afişi: görünür olunca gösterimi sayar, tıklamayı sayar ve
 * bağlantıyı yalnız güvenli ise (`safeAdHref`) açar. Banner'lar HERKESE
 * gösterilir: "reklamsız üyelik" avantajı devre dışıdır ve hiçbir üyelik
 * katmanı afişleri gizleyemez.
 */
function TopAdItem({ ad }: { ad: Advertisement }) {
  const router = useRouter();
  const ref = useRef<HTMLSpanElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useAdImpression(ref, ad.id);

  // Görselli afişte tıklama yalnız bölgelerden gelir; öğenin tamamı tıklanmaz.
  if (ad.imageUrl && !imageFailed) {
    return (
      <span ref={ref} className="relative flex h-6 flex-shrink-0 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ad.imageUrl}
          alt={ad.altText || ad.title}
          loading="lazy"
          decoding="async"
          // Kutu = görsel: `max-h`/`max-w` ile kendi oranında sığar (sabit
          // yükseklik + object-contain harf kutusu bırakır, alanlar kayardı).
          className="h-auto max-h-6 w-auto max-w-[200px]"
          onError={() => setImageFailed(true)}
        />
        <AdHotspots ad={ad} />
      </span>
    );
  }

  const handleClick = () => {
    trackAdEvent(ad.id, "click");
    const href = safeAdHref(ad.linkUrl);
    if (!href) return;
    if (isExternalAdHref(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    } else {
      router.push(href);
    }
  };

  return (
    <Button
      variant="secondary"
      type="button"
      onClick={handleClick}
      aria-label={ad.altText || ad.title}
      className="flex h-6 flex-shrink-0 items-center border-0 bg-transparent p-0 hover:bg-transparent hover:opacity-80"
    >
      <span ref={ref} className="flex items-center">
        <span className="whitespace-nowrap text-xs font-medium text-body">
          {ad.title}
        </span>
      </span>
    </Button>
  );
}

/**
 * A slim, light sponsored strip above the header. Clean and on-theme: a muted
 * "Sponsorlu" label with the ad creative(s) centered next to it, aligned to the
 * shared Container. Third-party creatives stay raw `<img>` (external URLs, not
 * next/image). Şerit TÜM `topbar` afişlerini gösterir (dönüşüm yok).
 */
export default function TopAdsBar() {
  const t = useTranslations();
  const { ads: topAds, reserved } = useActiveAds("topbar");

  // Üyenin katmanı (reklamsız mı) henüz bilinmiyor ama afişler hazır: şeridin
  // yüksekliğini (h-9) boş tutar. Reklamsız değilse içerik dolar, kayma olmaz.
  if (reserved) {
    return (
      <div
        className="w-full border-b border-border bg-surface-alt"
        aria-hidden="true"
      >
        <Container>
          <div className="h-9" />
        </Container>
      </div>
    );
  }

  if (topAds.length === 0) return null;

  return (
    <div
      className="w-full border-b border-border bg-surface-alt"
      role="region"
      aria-label={t("product.sponsoredRegion")}
    >
      <Container>
        <div className="flex h-9 items-center gap-3">
          <span className="flex-shrink-0 text-2xs font-medium uppercase tracking-wider text-subtle">
            {t("product.sponsored")}
          </span>
          <div className="flex flex-1 min-w-0 items-center justify-center gap-6 overflow-x-auto scrollbar-hide">
            {topAds.map((ad) => (
              <TopAdItem key={ad.id} ad={ad} />
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
