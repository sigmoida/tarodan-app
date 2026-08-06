/** @format */

"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { IconButton } from "@tarodan/ui";
import type { ListingImageItem } from "@/components/listings/form/listing-image-item";

export interface ImagePreviewGridProps {
  /** Görseller — EKRANDAKİ sırayla. */
  items: ListingImageItem[];
  /** Kalemi kimliğinden kaldır (indeksten DEĞİL). */
  onRemove: (clientId: string) => void;
  className?: string;
}

const FALLBACK = "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim";

/**
 * Yüklenen görsellerin küçük önizleme ızgarası.
 *
 * React anahtarı `clientId`dir: indeks anahtarı, aradan bir görsel silindiğinde
 * ya da sıra değiştiğinde React'in yanlış düğümü yeniden kullanmasına ve
 * önizlemenin başka bir görseli göstermesine yol açıyordu.
 */
export default function ImagePreviewGrid({
  items,
  onRemove,
  className = "",
}: ImagePreviewGridProps) {
  if (items.length === 0) return null;
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 ${className}`.trim()}
    >
      {items.map((item, index) => (
        <div
          key={item.clientId}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.previewUrl}
            alt={`Görsel ${index + 1}`}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK;
            }}
          />
          <IconButton
            variant="ghost"
            size="xs"
            onClick={() => onRemove(item.clientId)}
            aria-label="Görseli kaldır"
            className="absolute right-1.5 top-1.5 rounded-full bg-surface-elevated/90 text-muted shadow-sm ring-1 ring-border backdrop-blur-sm hover:bg-danger-500 hover:text-inverted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          >
            <XMarkIcon className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
