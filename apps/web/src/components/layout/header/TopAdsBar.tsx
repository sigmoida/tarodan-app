/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@tarodan/ui";
import { api } from "@/lib/api";
import { useTranslations } from "next-intl";
import { Container } from "../Container";

interface TopAd {
  id: string;
  title: string;
  imageUrl: string | null;
  linkUrl: string | null;
  content: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  deviceType: string;
}

/**
 * Owns the top-ads state: fetches active header ads for the current device,
 * records one impression per ad and tracks image-load failures. Banner'lar
 * HERKESE gösterilir: "reklamsız üyelik" avantajı devre dışıdır ve hiçbir
 * üyelik katmanı afişleri gizleyemez.
 */
function useTopAds() {
  const [topAds, setTopAds] = useState<TopAd[]>([]);
  const recordedImpressions = useRef<Set<string>>(new Set());
  const [adImageError, setAdImageError] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    const deviceType = isMobile ? "mobile" : "desktop";
    api
      .get<TopAd[]>("/ads/active", {
        params: { position: "header", device: deviceType },
      })
      .then((res) => {
        setTopAds(Array.isArray(res.data) ? res.data : []);
        setAdImageError(new Set());
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development")
          console.error("Failed to fetch ads:", err);
        setTopAds([]);
      });
  }, [isMobile]);

  // One impression per ad while the bar is shown.
  useEffect(() => {
    if (topAds.length === 0) return;
    topAds.forEach((ad) => {
      if (recordedImpressions.current.has(ad.id)) return;
      recordedImpressions.current.add(ad.id);
      api.post(`/ads/${ad.id}/impression`).catch(() => {});
    });
  }, [topAds]);

  const handleAdClick = (ad: TopAd) => {
    api.post(`/ads/${ad.id}/click`).catch(() => {});
    if (ad.linkUrl) window.open(ad.linkUrl, "_blank", "noopener,noreferrer");
  };

  const handleAdImageError = (adId: string) =>
    setAdImageError((prev) => new Set(prev).add(adId));

  return {
    topAds,
    adImageError,
    handleAdClick,
    handleAdImageError,
  };
}

/**
 * A slim, light sponsored strip above the header. Clean and on-theme: a muted
 * "Sponsorlu" label with the ad creative(s) centered next to it, aligned to the
 * shared Container. Third-party creatives stay raw `<img>` (external URLs, not
 * next/image).
 */
export default function TopAdsBar() {
  const t = useTranslations();
  const { topAds, adImageError, handleAdClick, handleAdImageError } =
    useTopAds();

  if (topAds.length === 0) return null;

  return (
    <div
      className="w-full border-b border-border bg-surface-alt"
      role="region"
      aria-label={t("product.sponsoredRegion")}
    >
      <Container className="px-4">
        <div className="flex h-9 items-center gap-3">
          <span className="flex-shrink-0 text-2xs font-medium uppercase tracking-wider text-subtle">
            {t("product.sponsored")}
          </span>
          <div className="flex flex-1 min-w-0 items-center justify-center gap-6 overflow-x-auto scrollbar-hide">
            {topAds.map((ad) => (
              <Button
                variant="secondary"
                key={ad.id}
                type="button"
                onClick={() => handleAdClick(ad)}
                aria-label={ad.altText || ad.title}
                className="flex h-6 flex-shrink-0 items-center border-0 bg-transparent p-0 hover:bg-transparent hover:opacity-80"
              >
                {ad.imageUrl && !adImageError.has(ad.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.imageUrl}
                    alt={ad.altText || ad.title}
                    loading="lazy"
                    decoding="async"
                    className="h-6 w-auto max-w-[200px] object-contain"
                    onError={() => handleAdImageError(ad.id)}
                  />
                ) : (
                  <span className="whitespace-nowrap text-xs font-medium text-body">
                    {ad.title}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
