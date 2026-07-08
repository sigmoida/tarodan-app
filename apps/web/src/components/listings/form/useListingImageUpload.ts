/** @format */

'use client';

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import toast from 'react-hot-toast';
import { mediaApi } from '@/lib/api';

export interface ListingImage {
	cardKey: string;
	detailKey: string;
}

interface UseListingImageUploadParams {
	/** The form owning an `images: ListingImage[]` field. */
	form: UseFormReturn<any>;
	/** Max images allowed (falls back to 3). */
	maxImages: number;
	/** Preview URL state (owned by the caller so it can be seeded on load). */
	imagePreviewUrls: string[];
	setImagePreviewUrls: Dispatch<SetStateAction<string[]>>;
}

/**
 * Shared image upload/remove logic for the new & edit listing forms. Uploads to
 * `mediaApi`, writes the `images` field via RHF `setValue` (validated), and keeps
 * the parallel preview-URL list in sync. Fills the remaining slots and rejects
 * only when already full.
 */
export function useListingImageUpload({
	form,
	maxImages,
	imagePreviewUrls,
	setImagePreviewUrls,
}: UseListingImageUploadParams) {
	const [uploadingImages, setUploadingImages] = useState(false);

	const handleFileUpload = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		const current: ListingImage[] = form.getValues('images') ?? [];
		const remaining = maxImages - current.length;
		if (remaining <= 0) {
			toast.error(`En fazla ${maxImages} resim yükleyebilirsiniz`);
			return;
		}
		const filesToUpload = Array.from(files).slice(0, remaining);

		setUploadingImages(true);
		try {
			const response = await mediaApi.uploadProductImages(filesToUpload);
			const uploaded: ListingImage[] = response.data.map(
				(r: { cardKey: string; detailKey: string }) => ({
					cardKey: r.cardKey,
					detailKey: r.detailKey,
				}),
			);
			const previews = response.data
				.map((r: { cardUrl?: string; cardKey?: string }) => r.cardUrl || r.cardKey || '')
				.filter(Boolean);
			form.setValue('images', [...current, ...uploaded], { shouldValidate: true });
			setImagePreviewUrls([...imagePreviewUrls, ...previews]);
			toast.success(`${uploaded.length} resim başarıyla yüklendi`);
		} catch (error: any) {
			toast.error(error.response?.data?.message || 'Resim yükleme başarısız');
		} finally {
			setUploadingImages(false);
		}
	};

	const removeImage = (index: number) => {
		form.setValue(
			'images',
			(form.getValues('images') as ListingImage[]).filter((_, i) => i !== index),
			{ shouldValidate: true },
		);
		setImagePreviewUrls(imagePreviewUrls.filter((_, i) => i !== index));
	};

	return { uploadingImages, handleFileUpload, removeImage };
}
