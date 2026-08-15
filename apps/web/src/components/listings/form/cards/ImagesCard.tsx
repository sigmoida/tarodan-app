/** @format */

"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Input } from "@tarodan/ui";
import { SectionCard, ImagePreviewGrid } from "@/components/ui";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  occupiedSlots,
  type ListingImageItem,
} from "../listing-image-item";

interface ImagesCardProps {
  maxImages: number;
  /** Görseller — ekrandaki sırayla; tek durum kaynağı. */
  items: ListingImageItem[];
  uploadingImages: boolean;
  handleFileUpload: (files: FileList | File[] | null) => void;
  removeImage: (clientId: string) => void;
  retryImage: (clientId: string) => void;
  moveImage: (from: number, to: number) => void;
  makeCover: (index: number) => void;
}

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * "Görseller" — sürükle-bırak alanı + dosya bazlı ilerleme gösteren önizleme
 * ızgarası.
 *
 * Masaüstünde dosyalar alana bırakılabilir; mobilde ve klavyeyle normal dosya
 * seçici çalışmaya devam eder (alan bir `<label>`, girdi gizli ama erişilebilir).
 */
export default function ImagesCard({
  maxImages,
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
  const [dragActive, setDragActive] = useState(false);
  /**
   * `dragenter`/`dragleave` iç elemanlarda da tetiklenir; sayaç tutulmazsa alan
   * kullanıcı içeride gezinirken sürekli yanıp sönerdi.
   */
  const dragDepth = useRef(0);

  // Kontenjan EKRANDAKİ kalemlerden sayılır; forma yalnız yüklenmişler yazılır.
  const usedSlots = occupiedSlots(items);
  const isFull = usedSlots >= maxImages;

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      if (isFull) return;
      handleFileUpload(event.dataTransfer?.files ?? null);
    },
    [handleFileUpload, isFull],
  );

  return (
    <SectionCard title={t("product.images")}>
      <p className="text-xs text-muted -mt-2 mb-4">
        {t("product.upToImages", { count: maxImages })}
      </p>
      <div className="space-y-3">
        {!isFull ? (
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragActive(false);
            }}
            onDrop={onDrop}
            data-drag-active={dragActive || undefined}
            data-testid="listing-image-dropzone"
            className={`flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragActive
                ? "border-primary-500 bg-primary-50/60"
                : "border-border hover:border-primary-400 hover:bg-primary-50/30"
            }`}
          >
            <PhotoIcon className="w-8 h-8 text-subtle" />
            <span className="text-sm text-muted font-medium">
              {t("product.clickToUpload")}
            </span>
            <span className="text-xs text-subtle">
              {usedSlots} / {maxImages} {t("product.uploaded")}
            </span>
            <span className="text-xs text-subtle">
              {t("product.imageFormatsHint", {
                maxMb: megabytes(MAX_IMAGE_BYTES),
              })}
            </span>
            <Input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              data-testid="listing-image-input"
              onChange={(e) => {
                handleFileUpload(e.target.files);
                // Aynı dosya ikinci kez seçilebilsin diye girdi sıfırlanır.
                e.target.value = "";
              }}
              className="hidden"
            />
          </label>
        ) : (
          <div className="py-4 border border-success-200 bg-success-50 rounded-xl text-success-700 text-sm text-center">
            {t("product.maxImagesReached")}
          </div>
        )}
        {imagesError && (
          <p className="text-sm text-danger-600">{imagesError}</p>
        )}
        {uploadingImages && (
          <p className="text-sm text-primary-600" role="status">
            {t("product.uploadingImages")}
          </p>
        )}
        <ImagePreviewGrid
          items={items}
          onRemove={removeImage}
          onRetry={retryImage}
          onMove={moveImage}
          onMakeCover={makeCover}
        />
      </div>
    </SectionCard>
  );
}
