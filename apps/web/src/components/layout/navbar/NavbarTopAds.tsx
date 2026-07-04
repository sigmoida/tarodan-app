'use client';

import { Button } from '@tarodan/ui';
import { useTopAds } from './hooks/useTopAds';

/**
 * Slim top bar image marquee (50px desktop / 40px mobile). Renders active
 * header ads for non ad-free users. The external ad creatives stay raw `<img>`
 * (not next/image) since they are third-party creative URLs.
 */
export default function NavbarTopAds() {
  const { shouldShowAd, topAds, isMobile, adImageError, handleAdClick, handleAdImageError } = useTopAds();

  if (!shouldShowAd || topAds.length === 0) return null;

  return (
    <div
      className="w-full relative flex items-center overflow-hidden border-b border-border-strong bg-heading"
      style={{
        height: isMobile ? 40 : 50,
        maxHeight: 60,
      }}
      role="region"
      aria-label="Reklam alanı"
    >
      {/* Marquee: bir set reklam + viewport boşluğu + tekrar aynı set → aynı anda tek logo görünür */}
      <div className="ad-marquee-track flex flex-nowrap items-center flex-shrink-0 gap-8 h-full pr-8">
        {topAds.map((ad, index) => (
          <Button variant="secondary" key={`a-${ad.id}-${index}`}
            type="button"
            onClick={() => handleAdClick(ad)}
            className="flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity"
            style={{ height: isMobile ? 40 : 50 }}
            aria-label={ad.altText || ad.title}>
            {ad.imageUrl && !adImageError.has(ad.id) ? (
              <img
                src={ad.imageUrl}
                alt={ad.altText || ad.title}
                loading="lazy"
                decoding="async"
                className="h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]"
                style={{ maxHeight: isMobile ? 40 : 50 }}
                onError={() => handleAdImageError(ad.id)}
              />
            ) : (
              <span className="text-primary-400 text-xs font-medium px-4 whitespace-nowrap">
                {ad.title}
              </span>
            )}
          </Button>
        ))}
        {/* İki set arasında en az viewport genişliği boşluk → ikinci logo ekranda çıkana kadar birinci kayar */}
        <div className="flex-shrink-0 h-full" style={{ minWidth: '100vw' }} aria-hidden />
        {topAds.map((ad, index) => (
          <Button variant="secondary" key={`b-${ad.id}-${index}`}
            type="button"
            onClick={() => handleAdClick(ad)}
            className="flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity"
            style={{ height: isMobile ? 40 : 50 }}
            aria-label={ad.altText || ad.title}>
            {ad.imageUrl && !adImageError.has(ad.id) ? (
              <img
                src={ad.imageUrl}
                alt={ad.altText || ad.title}
                loading="lazy"
                decoding="async"
                className="h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]"
                style={{ maxHeight: isMobile ? 40 : 50 }}
                onError={() => handleAdImageError(ad.id)}
              />
            ) : (
              <span className="text-primary-400 text-xs font-medium px-4 whitespace-nowrap">
                {ad.title}
              </span>
            )}
          </Button>
        ))}
      </div>
      {/* Sponsorlu badge - sol üst */}
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-[9px] text-muted opacity-60 select-none pointer-events-none"
        aria-hidden
      >
        Sponsorlu
      </span>
    </div>
  );
}
