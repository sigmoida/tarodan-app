/** @format */

"use client";

import { PhotoIcon } from "@heroicons/react/24/outline";
import { Button, Input } from "@tarodan/ui";
import { FormSection } from "./FormSection";
import { useNewListing } from "../_context/NewListingContext";

export default function ImagesSection() {
  const {
    locale,
    limits,
    formData,
    imagePreviewUrls,
    uploadingImages,
    handleFileUpload,
    removeImage,
  } = useNewListing();

  const maxImages = limits?.maxImagesPerListing || 3;

  return (
    <FormSection title="Görseller">
      <div className="space-y-3">
        {formData.images.length < maxImages ? (
          <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
            <PhotoIcon className="w-8 h-8 text-subtle" />
            <span className="text-sm text-muted font-medium">
              {locale === "en"
                ? "Click to upload images"
                : "Görsel yüklemek için tıklayın"}
            </span>
            <span className="text-xs text-subtle">
              {formData.images.length} / {maxImages}{" "}
              {locale === "en" ? "uploaded" : "yüklendi"}
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
          <div className="py-4 border border-success-200 bg-success-50 rounded text-success-700 text-sm text-center">
            Maksimum görsel sayısına ulaştınız
          </div>
        )}
        {uploadingImages && (
          <p className="text-sm text-primary-600">Resimler yükleniyor...</p>
        )}
        {formData.images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {formData.images.map((img, index) => {
              const previewUrl =
                imagePreviewUrls?.[index] ||
                (typeof img === "object" ? img?.cardKey : img);
              return (
                <div key={index} className="relative group aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover rounded border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim";
                    }}
                  />
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-danger-500 text-inverted rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FormSection>
  );
}
