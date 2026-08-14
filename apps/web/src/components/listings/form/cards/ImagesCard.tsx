/** @format */

"use client";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@tarodan/ui";
import { SectionCard, ImagePreviewGrid } from "@/components/ui";
import { occupiedSlots, type ListingImageItem } from "../listing-image-item";
import ImageGuidelines from "./ImageGuidelines";
import ListingImageDropzone from "./ListingImageDropzone";

interface ImagesCardProps {
  maxImages: number;
  /**
   * Yönerge paneli açık başlasın mı? Karar ÇAĞIRANINDIR, `items` bakılarak
   * verilemez: düzenleme ekranında kart, kayıtlı görseller yerleştirilmeden
   * (seed bir effect'te koşuyor) mount olur ve liste o anda daima boştur —
   * Radix `defaultValue`'yu yalnız mount'ta okuduğu için panel her düzenlemede
   * açık kalırdı. Yeni ilan → açık, düzenleme → kapalı.
   */
  guidelinesDefaultOpen?: boolean;
  /** Görseller — ekrandaki sırayla; tek durum kaynağı. */
  items: ListingImageItem[];
  uploadingImages: boolean;
  handleFileUpload: (files: FileList | File[] | null) => void;
  removeImage: (clientId: string) => void;
  retryImage: (clientId: string) => void;
  moveImage: (from: number, to: number) => void;
  makeCover: (index: number) => void;
}

/**
 * "Fotoğraflar" kartı — kontenjan göstergesi, sürükle-bırak alanı, kapak
 * görselini öne çıkaran önizleme ızgarası ve katlanır yönerge paneli.
 *
 * Kart yalnız KOMPOZİSYON yapar: dosya girdisi + sürükleme durumu
 * `ListingImageDropzone`ta, karo davranışı `ImagePreviewGrid`te, yükleme
 * durumu `useListingImageUpload`ta.
 */
export default function ImagesCard({
  maxImages,
  guidelinesDefaultOpen = true,
  items,
  uploadingImages,
  handleFileUpload,
  removeImage,
  retryImage,
  moveImage,
  makeCover,
}: ImagesCardProps) {
  const { formState } = useFormContext();
  const imagesError = formState.errors.images?.message as string | undefined;
  const t = useTranslations();

  // Kontenjan EKRANDAKİ kalemlerden sayılır; forma yalnız yüklenmişler yazılır.
  const usedSlots = occupiedSlots(items);
  const isFull = usedSlots >= maxImages;
  const fillPercent = Math.min(100, Math.round((usedSlots / maxImages) * 100));

  return (
    <SectionCard
      title={t("product.images")}
      badge={
        <Badge variant={isFull ? "success" : "secondary"} size="sm">
          {isFull
            ? t("product.imageUpload.full")
            : t("product.imageUpload.counter", {
                used: usedSlots,
                max: maxImages,
              })}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="-mt-2 space-y-1.5">
          <p className="text-xs text-muted">
            {t("product.imageUpload.orderHint")}
          </p>
          {usedSlots > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  isFull ? "bg-success-500" : "bg-primary-500"
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <ListingImageDropzone
            variant="hero"
            used={usedSlots}
            max={maxImages}
            onFiles={handleFileUpload}
          />
        ) : (
          <ImagePreviewGrid
            items={items}
            onRemove={removeImage}
            onRetry={retryImage}
            onMove={moveImage}
            onMakeCover={makeCover}
            trailing={
              isFull ? undefined : (
                <ListingImageDropzone
                  variant="tile"
                  used={usedSlots}
                  max={maxImages}
                  onFiles={handleFileUpload}
                />
              )
            }
          />
        )}

        {isFull && (
          <p className="flex items-center gap-1.5 text-xs text-success-700">
            <CheckCircleIcon className="h-4 w-4 flex-none" />
            {t("product.maxImagesReached")}
          </p>
        )}
        {imagesError && (
          <p className="flex items-center gap-1.5 text-sm text-danger-600">
            <ExclamationCircleIcon className="h-4 w-4 flex-none" />
            {imagesError}
          </p>
        )}
        {uploadingImages && (
          <p
            className="flex items-center gap-1.5 text-sm text-primary-600"
            role="status"
          >
            <ArrowPathIcon className="h-4 w-4 flex-none animate-spin" />
            {t("product.uploadingImages")}
          </p>
        )}

        <ImageGuidelines defaultOpen={guidelinesDefaultOpen} />
      </div>
    </SectionCard>
  );
}
