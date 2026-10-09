/** @format */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import OptimizedImage from "@/components/OptimizedImage";
import { Link } from "@/i18n/navigation";
import { useAdImpression } from "@/hooks/useAdImpression";
import {
  trackAdEvent,
  type Advertisement,
  type AdPosition,
} from "@/lib/api/advertisements";
import { adAspectRatio } from "@/lib/ads/adAspect";
import { isExternalAdHref, safeAdHref } from "@/lib/ads/safeAdHref";

/**
 * Tek afişin çizimi — header/footer/inline/popup yuvalarının ortak gövdesi.
 * Üç iş yapar: görseli kırpmadan (`object-contain`) kendi oranında çizer,
 * görünür olunca gösterimi sayar, tıklamayı `sendBeacon` ile sayar.
 *
 * Görsel kutusu veri geldikten SONRA çizilir (yuva boşken yer ayrılmaz);
 * oran afişin kendi ölçüsünden gelir, böylece görsel yüklenirken kayma olmaz.
 */
export default function AdCreative({
  ad,
  position,
  sizes = "100vw",
  className,
  onNavigate,
}: {
  ad: Advertisement;
  position: AdPosition;
  sizes?: string;
  className?: string;
  /** Tıklamadan sonra (ör. popup'ı kapatmak için). */
  onNavigate?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  useAdImpression(boxRef, ad.id);

  const body = (
    <div
      ref={boxRef}
      className={
        className ??
        "overflow-hidden rounded-lg border border-border bg-surface-elevated"
      }
    >
      {ad.imageUrl ? (
        <div
          className="relative w-full bg-surface-alt"
          style={{ aspectRatio: adAspectRatio(ad, position) }}
        >
          <OptimizedImage
            src={ad.imageUrl}
            alt={ad.altText || ad.title}
            fill
            sizes={sizes}
            className="object-contain"
            logContext={{ page: "banner", adId: ad.id }}
          />
        </div>
      ) : (
        <AdTextBody ad={ad} />
      )}
    </div>
  );

  return (
    <AdLink ad={ad} onNavigate={onNavigate}>
      {body}
    </AdLink>
  );
}

/** Bağlantı güvenli değilse (ya da yoksa) sarmalayıcı çizilmez. */
function AdLink({
  ad,
  onNavigate,
  children,
}: {
  ad: Advertisement;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const href = safeAdHref(ad.linkUrl);
  if (!href) return <>{children}</>;

  const onClick = () => {
    trackAdEvent(ad.id, "click");
    onNavigate?.();
  };

  if (isExternalAdHref(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={onClick}
        className="block"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} rel="sponsored" onClick={onClick} className="block">
      {children}
    </Link>
  );
}

/** Görselsiz afiş: başlık, metin ve (varsa) kampanya kodu / geri sayım. */
function AdTextBody({ ad }: { ad: Advertisement }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold text-heading">{ad.title}</p>
        {ad.content && (
          <p className="mt-0.5 text-sm text-muted">{ad.content}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {ad.campaign?.isFlashSale && ad.campaign.endsAt && (
          <FlashCountdown endsAt={ad.campaign.endsAt} />
        )}
        {ad.campaign?.code && (
          <span className="rounded-lg bg-primary-50 px-3 py-1.5 font-mono text-sm font-semibold text-primary-600">
            {ad.campaign.code}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Flash kampanya geri sayımı. "Flash Sale" bayrağı bugüne kadar hiçbir şey
 * yapmıyordu (yalnız admin listesinde rozet çıkarıyordu); aciliyeti gösteren
 * yer burasıdır.
 */
function FlashCountdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState(() => remaining(endsAt));

  useEffect(() => {
    const timer = setInterval(() => setLeft(remaining(endsAt)), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (!left) return null;
  return (
    <span className="rounded-lg bg-danger-50 px-3 py-1.5 font-mono text-sm font-semibold text-danger-600">
      ⚡ {left}
    </span>
  );
}

/** Kalan süre "12:34:56" / "3g 04:12" — bitmişse null. */
function remaining(endsAt: string): string | null {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return days > 0
    ? `${days}g ${pad(hours)}:${pad(minutes)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
