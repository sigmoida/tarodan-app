/** @format */

"use client";

import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button, IconButton } from "@tarodan/ui";
import type { ListingImageItem } from "@/components/listings/form/listing-image-item";

export interface ImagePreviewGridProps {
  /** Görseller — EKRANDAKİ sırayla. */
  items: ListingImageItem[];
  /** Kalemi kimliğinden kaldır (indeksten DEĞİL). */
  onRemove: (clientId: string) => void;
  /** Hata alan kalemi yeniden dene. */
  onRetry?: (clientId: string) => void;
  className?: string;
}

const FALLBACK = "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim";

/**
 * Yüklenen görsellerin küçük önizleme ızgarası; her kalem KENDİ durumunu
 * gösterir.
 *
 * React anahtarı `clientId`dir: indeks anahtarı, aradan bir görsel silindiğinde
 * ya da sıra değiştiğinde React'in yanlış düğümü yeniden kullanmasına ve
 * önizlemenin başka bir görseli göstermesine yol açıyordu.
 */
export default function ImagePreviewGrid({
  items,
  onRemove,
  onRetry,
  className = "",
}: ImagePreviewGridProps) {
  if (items.length === 0) return null;
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 ${className}`.trim()}
    >
      {items.map((item, index) => {
        const isBusy =
          item.status === "queued" ||
          item.status === "uploading" ||
          item.status === "processing";
        return (
          <div
            key={item.clientId}
            data-testid="listing-image-tile"
            data-status={item.status}
            className={`group relative aspect-square overflow-hidden rounded-lg border bg-surface ${
              item.status === "failed" ? "border-danger-300" : "border-border"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={`Görsel ${index + 1}`}
              className={`h-full w-full object-cover ${isBusy ? "opacity-60" : ""}`}
              onError={(e) => {
                (e.target as HTMLImageElement).src = FALLBACK;
              }}
            />

            {/* Bayt aktarımı: gerçek yüzde. Aktarım bitip yanıt beklenirken
                sunucu tarafı (moderasyon, dönüştürme, depolama) sürüyor; sahte
                bir yüzde yerine "İşleniyor" yazılır. */}
            {isBusy && (
              <div className="absolute inset-x-0 bottom-0 bg-surface-elevated/90 px-1.5 py-1 backdrop-blur-sm">
                <p className="text-[10px] font-medium text-body">
                  {item.status === "processing"
                    ? "İşleniyor"
                    : item.status === "queued"
                      ? "Sırada"
                      : `Yükleniyor %${item.progress}`}
                </p>
                <div
                  className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-alt"
                  role="progressbar"
                  aria-valuenow={item.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Görsel ${index + 1} yükleniyor`}
                >
                  <div
                    className={`h-full bg-primary-500 transition-[width] ${
                      item.status === "processing" ? "animate-pulse" : ""
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </div>
            )}

            {item.status === "failed" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-danger-50/90 p-1 text-center">
                <p className="text-[10px] leading-tight text-danger-700">
                  {item.error ?? "Yüklenemedi"}
                </p>
                {onRetry && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onRetry(item.clientId)}
                    className="px-2 py-0.5 text-[10px]"
                  >
                    <ArrowPathIcon className="mr-1 h-3 w-3" />
                    Tekrar dene
                  </Button>
                )}
              </div>
            )}

            <IconButton
              variant="ghost"
              size="xs"
              onClick={() => onRemove(item.clientId)}
              aria-label={`Görsel ${index + 1} kaldır`}
              className="absolute right-1.5 top-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-danger-500 hover:text-inverted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <XMarkIcon className="h-4 w-4" />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
