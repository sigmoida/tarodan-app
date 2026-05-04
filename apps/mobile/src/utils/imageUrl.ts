/**
 * Image URL utilities for the mobile app.
 *
 * Images are stored in AWS S3 and the API returns presigned URLs
 * (https://amzn-tarodan.s3.eu-west-1.amazonaws.com/...) that are
 * directly usable by React Native <Image />.
 *
 * This module validates URLs and provides placeholder fallbacks.
 */

const PLACEHOLDER = 'https://placehold.co/200x150/f3f4f6/9ca3af?text=Ürün';

/**
 * Check whether a value is a valid, browser-renderable image URL.
 * Bare S3 keys (e.g. "dev/products/abc.jpg") are NOT valid.
 */
const isValidImageUrl = (value: unknown): value is string => {
  if (!value || typeof value !== 'string') return false;
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:')
  );
};

/**
 * Transform / validate an image URL coming from the API.
 *
 * The API now returns presigned S3 URLs for every image. This function
 * simply validates them and falls back to a placeholder when needed.
 *
 * @param url - The image URL (can be string or object with url property)
 * @returns A valid image URL string
 */
export const transformImageUrl = (url: string | { url?: string; cardUrl?: string; detailUrl?: string } | null | undefined): string => {
  if (!url) return PLACEHOLDER;

  const urlString = typeof url === 'string'
    ? url
    : (url.detailUrl || url.cardUrl || url.url || '');

  if (isValidImageUrl(urlString)) return urlString;

  return PLACEHOLDER;
};

/**
 * Get image URL from images array (handles both string and object formats).
 *
 * @param images - Array of images (can be strings or objects with url property)
 * @returns First valid image URL or placeholder
 */
export const getImageUrl = (images: any): string => {
  if (!images || (Array.isArray(images) && images.length === 0)) {
    return PLACEHOLDER;
  }

  const firstImage = Array.isArray(images) ? images[0] : images;

  if (typeof firstImage === 'string') {
    return transformImageUrl(firstImage);
  }

  const url = firstImage?.cardUrl || firstImage?.detailUrl || firstImage?.url || firstImage?.imageUrl;
  return transformImageUrl(url || firstImage);
};
