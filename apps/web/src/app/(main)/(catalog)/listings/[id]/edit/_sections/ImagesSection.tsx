import { PhotoIcon } from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import type { MembershipLimits } from '@/stores/authStore';
import type { EditListingFormData } from '../_lib/types';

interface ImagesSectionProps {
  formData: EditListingFormData;
  imagePreviewUrls: string[];
  uploadingImages: boolean;
  handleFileUpload: (files: FileList | null) => void;
  removeImage: (index: number) => void;
  limits: MembershipLimits | null;
}

export default function ImagesSection({
  formData,
  imagePreviewUrls,
  uploadingImages,
  handleFileUpload,
  removeImage,
  limits,
}: ImagesSectionProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-body mb-2">
        Ürün Görselleri (En fazla {limits?.maxImagesPerListing || 3})
      </label>
      <div className="space-y-3">
        {formData.images.length < (limits?.maxImagesPerListing || 3) ? (
          <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors">
            <PhotoIcon className="w-8 h-8 text-subtle" />
            <span className="text-sm text-muted font-medium">
              Görsel yüklemek için tıklayın
            </span>
            <span className="text-xs text-subtle">
              {formData.images.length} / {limits?.maxImagesPerListing || 3} yüklendi
            </span>
            <input
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
            Maksimum görsel sayısına ulaştınız
          </div>
        )}
        {uploadingImages && (
          <p className="text-sm text-primary-600">Resimler yükleniyor...</p>
        )}

        {formData.images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {formData.images.map((img, index) => {
              const previewUrl = imagePreviewUrls[index] || (typeof img === 'object' ? img?.cardKey : img);
              return (
                <div key={index} className="relative group">
                  <img
                    src={previewUrl}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Resim';
                    }}
                  />
                  <Button variant="secondary" type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-danger-500 text-inverted rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-sm text-muted mt-2">
        {formData.images.length} / {limits?.maxImagesPerListing || 3} resim yüklendi
      </p>
    </div>
  );
}
