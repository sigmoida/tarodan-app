/** @format */

"use client";

import { useEffect, useMemo } from "react";
import { Input } from "@/components/ui";
import { IconButton } from "@tarodan/ui";
import { useTranslations } from "next-intl";

const MAX_PHOTOS = 5;

interface EvidencePhotoPickerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Zorunluysa yıldız, değilse "(isteğe bağlı)" gösterilir. */
  required?: boolean;
  disabled?: boolean;
}

/**
 * İade kanıt fotoğrafı seçici (maks 5): önizleme + ekle + kaldır. Tekil iade
 * modalı ile toplu iade modalı aynı alanı paylaşır; dosya listesi çağıranda,
 * önizlemeler burada yaşar.
 */
export default function EvidencePhotoPicker({
  files,
  onFilesChange,
  required = false,
  disabled = false,
}: EvidencePhotoPickerProps) {
  const t = useTranslations();

  // Önizlemeler DOSYA listesinden türetilir: previews[i] HER ZAMAN files[i]'dir.
  // Eski FileReader yaklaşımında eşzamanlı okumalar sırasız tamamlanıyor,
  // önizleme-dosya eşleşmesi bozuluyor ve × butonu YANLIŞ fotoğrafı silip
  // silinenin küçük resmini ekranda bırakabiliyordu.
  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  const handleAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const newFiles = selected.slice(0, MAX_PHOTOS - files.length);
    if (newFiles.length === 0) return;
    onFilesChange([...files, ...newFiles]);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-body mb-2">
        {t("order.evidencePhotosMax5")}{" "}
        {required ? (
          <span className="text-danger-500">*</span>
        ) : (
          <span className="text-muted font-normal">
            ({t("common.optional")})
          </span>
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, idx) => (
          <div
            key={src}
            className="relative w-16 h-16 rounded-lg overflow-hidden border border-border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="w-full h-full object-cover" />
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              aria-label={t("common.delete")}
              onClick={() => handleRemove(idx)}
              disabled={disabled}
              className="absolute right-0 top-0 h-5 w-5 rounded-bl-lg bg-danger-500 text-inverted"
            >
              ×
            </IconButton>
          </div>
        ))}
        {files.length < MAX_PHOTOS && !disabled && (
          <label className="w-16 h-16 border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary-400 rounded-lg">
            <span className="text-2xl text-subtle">+</span>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={handleAdd}
              className="hidden"
            />
          </label>
        )}
      </div>
      <p className="text-xs text-muted mt-1">{t("order.tapToUploadPhotos")}</p>
    </div>
  );
}
