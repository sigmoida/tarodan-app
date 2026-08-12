/** @format */

"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import OptimizedImage from "@/components/OptimizedImage";
import {
  advertisementsApi,
  type Advertisement,
  type AdPosition,
} from "@/lib/api/advertisements";

/**
 * Banner yuvası — admin'in tanımladığı afişlerin sayfadaki karşılığı.
 *
 * Bu yuva var olmadan önce admin banner yaratabiliyordu ama hiçbir ziyaretçi
 * görmüyordu: gösterim ve tıklama sayaçları da hep sıfırdı. Yuva üç işi yapar:
 * konuma ait afişleri çeker, göründüğünde gösterimi sayar, tıklandığında
 * tıklamayı sayar.
 *
 * Aynı yuva platformun KENDİ kampanya duyurusunu da taşır: afiş bir kampanyaya
 * bağlıysa (ör. "komisyonsuz alışveriş") başlığın yanında kupon kodu görünür ve
 * kampanya bitince API afişi zaten döndürmez.
 *
 * Banner herkese gösterilir; üyeliğe bağlı bir gizleme kuralı YOKTUR.
 */
export default function BannerSlot({
  position,
  className,
}: {
  position: AdPosition;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["advertisements", position],
    queryFn: async () => {
      const res = await advertisementsApi.getActive({ position });
      return (res.data?.data ?? res.data ?? []) as Advertisement[];
    },
    // Afişler saatlerce değişmez; her gezinmede yeniden sormak gereksiz yük.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const ads = data ?? [];
  if (!ads.length) return null;

  return (
    <div className={className}>
      {ads.map((ad) => (
        <BannerItem key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function BannerItem({ ad }: { ad: Advertisement }) {
  const counted = useRef(false);

  useEffect(() => {
    // Gösterim bir kez sayılır: React'in çift render'ı sayacı ikilemesin.
    if (counted.current) return;
    counted.current = true;
    advertisementsApi.recordImpression(ad.id).catch(() => {});
  }, [ad.id]);

  const body = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {ad.imageUrl ? (
        <div className="relative aspect-[970/250] w-full">
          <OptimizedImage
            src={ad.imageUrl}
            alt={ad.altText || ad.title}
            fill
            className="object-cover"
            logContext={{ page: "banner", adId: ad.id }}
          />
        </div>
      ) : (
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
      )}
    </div>
  );

  if (!ad.linkUrl) return body;

  return (
    <a
      href={ad.linkUrl}
      onClick={() => {
        advertisementsApi.recordClick(ad.id).catch(() => {});
      }}
      className="block"
    >
      {body}
    </a>
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
