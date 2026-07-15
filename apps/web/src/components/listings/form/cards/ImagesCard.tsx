/** @format */

"use client";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Input } from "@tarodan/ui";
import { SectionCard, ImagePreviewGrid } from "@/components/ui";
import type { ListingImage } from "../useListingImageUpload";

interface ImagesCardProps {
  locale: string;
  maxImages: number;
  imagePreviewUrls: string[];
  uploadingImages: boolean;
  handleFileUpload: (files: FileList | null) => void;
  removeImage: (index: number) => void;
}

/** "Görseller" — upload dropzone + compact preview grid. Reads the `images`
 *  field from form context (and surfaces its validation error). Shared. */
export default function ImagesCard({
  locale,
  maxImages,
  imagePreviewUrls,
  uploadingImages,
  handleFileUpload,
  removeImage,
}: ImagesCardProps) {
  const { watch, formState } = useFormContext();
  const images: ListingImage[] = watch("images") ?? [];
  const imagesError = formState.errors.images?.message as string | undefined;
  const t = useTranslations();
  // Template-literal ternary (interpolates `maxImages`) — left for the later
  // ICU-parameter sweep.
  const en = locale === "en";

  const previewUrls = images.map(
    (img, index) =>
      imagePreviewUrls[index] || (typeof img === "object" ? img?.cardKey : img),
  );

  return (
    <SectionCard title={t("product.images")}>
      <p className="text-xs text-muted -mt-2 mb-4">
        {en ? `Up to ${maxImages} images` : `En fazla ${maxImages} görsel`}
      </p>
      <div className="space-y-3">
        {images.length < maxImages ? (
          <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
            <PhotoIcon className="w-8 h-8 text-subtle" />
            <span className="text-sm text-muted font-medium">
              {t("product.clickToUpload")}
            </span>
            <span className="text-xs text-subtle">
              {images.length} / {maxImages} {t("product.uploaded")}
            </span>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={uploadingImages}
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
          <p className="text-sm text-primary-600">
            {t("product.uploadingImages")}
          </p>
        )}
        <ImagePreviewGrid urls={previewUrls} onRemove={removeImage} />
      </div>
    </SectionCard>
  );
}
