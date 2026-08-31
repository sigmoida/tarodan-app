/** @format */

"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpTrayIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Badge, Input } from "@tarodan/ui";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MIN_RECOMMENDED_DIMENSION,
} from "../listing-image-item";

const MEGABYTES = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));

export interface ListingImageDropzoneProps {
  /**
   * `hero` — hiç görsel yokken kartı karşılayan büyük alan.
   * `tile` — ızgaranın sonundaki "+ Ekle" kutucuğu.
   *
   * İkisi TEK bileşenin varyantıdır: dosya girdisi, sürükleme sayacı ve
   * `data-testid` sözleşmesi tek yerde durur, ekranda asla iki dropzone olmaz.
   */
  variant: "hero" | "tile";
  used: number;
  max: number;
  onFiles: (files: FileList | File[] | null) => void;
}

export default function ListingImageDropzone({
  variant,
  used,
  max,
  onFiles,
}: ListingImageDropzoneProps) {
  const t = useTranslations();
  const [dragActive, setDragActive] = useState(false);
  /**
   * `dragenter`/`dragleave` iç elemanlarda da tetiklenir; sayaç tutulmazsa alan
   * kullanıcı içeride gezinirken sürekli yanıp sönerdi.
   */
  const dragDepth = useRef(0);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      onFiles(event.dataTransfer?.files ?? null);
    },
    [onFiles],
  );

  const dragHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    },
    onDragOver: (event: React.DragEvent<HTMLLabelElement>) =>
      event.preventDefault(),
    onDragLeave: (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    },
    onDrop,
  };

  const isHero = variant === "hero";
  const remaining = Math.max(0, max - used);

  const base =
    "group relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed text-center transition-all";
  const tone = dragActive
    ? "border-primary-500 bg-primary-50 ring-4 ring-primary-100"
    : "border-border bg-surface-alt/40 hover:border-primary-400 hover:bg-primary-50/40";
  const shape = isHero
    ? "gap-2 rounded-2xl px-4 py-8 sm:py-10"
    : "aspect-square gap-1 rounded-xl p-2";

  return (
    <label
      {...dragHandlers}
      data-drag-active={dragActive || undefined}
      data-testid="listing-image-dropzone"
      className={`${base} ${tone} ${shape}`}
    >
      {isHero ? (
        <>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-transform group-hover:scale-105">
            <ArrowUpTrayIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-heading sm:text-base">
            {dragActive
              ? t("product.imageUpload.dropHere")
              : t("product.imageUpload.heroTitle")}
          </span>
          <span className="text-xs text-muted">
            {t("product.imageUpload.heroSubtitle")}
          </span>
          {/* Gerçek bir buton DEĞİL: `<label>` içinde iç içe etkileşimli öğe
              olmasın diye buton görünümlü bir span. Tıklama zaten label'a. */}
          <span className="mt-1 inline-flex items-center rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-inverted shadow-sm transition-colors group-hover:bg-primary-600">
            {t("product.imageUpload.browse")}
          </span>
          <span className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            <Badge variant="secondary" size="sm">
              {t("product.imageUpload.formats")}
            </Badge>
            <Badge variant="secondary" size="sm">
              {t("product.imageUpload.maxSize", { size: MEGABYTES })}
            </Badge>
            <Badge variant="secondary" size="sm">
              {t("product.imageUpload.minDimension", {
                size: MIN_RECOMMENDED_DIMENSION,
              })}
            </Badge>
          </span>
          <span className="text-[11px] text-subtle">
            {t("product.imageUpload.slotsLeft", { count: remaining })}
          </span>
        </>
      ) : (
        <>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-600 transition-transform group-hover:scale-110">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="text-xs font-semibold text-heading">
            {t("product.imageUpload.addMore")}
          </span>
          <span className="text-[10px] text-subtle">
            {t("product.imageUpload.counter", { used, max })}
          </span>
        </>
      )}

      <Input
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        data-testid="listing-image-input"
        onChange={(e) => {
          onFiles(e.target.files);
          // Aynı dosya ikinci kez seçilebilsin diye girdi sıfırlanır.
          e.target.value = "";
        }}
        className="hidden"
      />
    </label>
  );
}
