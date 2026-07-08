import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import toast from 'react-hot-toast';
import { mediaApi } from '@/lib/api';
import type { MembershipLimits } from '@/stores/authStore';
import type { EditListingFormData } from '../_lib/types';

interface UseListingImagesParams {
  formData: EditListingFormData;
  setFormData: Dispatch<SetStateAction<EditListingFormData>>;
  imagePreviewUrls: string[];
  setImagePreviewUrls: Dispatch<SetStateAction<string[]>>;
  limits: MembershipLimits | null;
}

export function useListingImages({
  formData,
  setFormData,
  imagePreviewUrls,
  setImagePreviewUrls,
  limits,
}: UseListingImagesParams) {
  const [uploadingImages, setUploadingImages] = useState(false);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const maxImages = limits?.maxImagesPerListing || 3;
    const currentCount = formData.images.length;

    if (currentCount + files.length > maxImages) {
      toast.error(`En fazla ${maxImages} resim yükleyebilirsiniz`);
      return;
    }

    setUploadingImages(true);
    try {
      const fileArray = Array.from(files);
      const response = await mediaApi.uploadProductImages(fileArray);

      const uploadedImages = response.data.map((r: { cardKey: string; detailKey: string }) => ({
        cardKey: r.cardKey,
        detailKey: r.detailKey,
      }));
      const previewUrls = response.data.map((r: { cardUrl?: string; cardKey?: string }) => r.cardUrl || r.cardKey || '').filter(Boolean);

      setFormData({
        ...formData,
        images: [...formData.images, ...uploadedImages],
      });
      setImagePreviewUrls([...imagePreviewUrls, ...previewUrls]);
      toast.success(`${uploadedImages.length} resim başarıyla yüklendi`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Resim yükleme başarısız');
    } finally {
      setUploadingImages(false);
    }
  };

  const removeImage = (index: number) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
    setImagePreviewUrls(imagePreviewUrls.filter((_, i) => i !== index));
  };

  return { uploadingImages, handleFileUpload, removeImage };
}
