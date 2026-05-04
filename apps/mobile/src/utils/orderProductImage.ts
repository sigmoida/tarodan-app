import { transformImageUrl, getImageUrl } from './imageUrl';

/** API formatOrderResponse: product.imageUrl veya images dizisi */
export function getOrderProductImageUri(product: {
  imageUrl?: string | null;
  images?: unknown;
} | null | undefined): string {
  if (!product) return 'https://via.placeholder.com/80';
  if (product.imageUrl && typeof product.imageUrl === 'string') {
    return transformImageUrl(product.imageUrl);
  }
  return getImageUrl(product.images);
}
