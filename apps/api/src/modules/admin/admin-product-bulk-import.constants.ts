import { MAX_UPLOAD_BYTES } from "../../common/upload/multer-options";

export const PRODUCT_BULK_IMPORT_LIMITS = {
  maxRows: 25,
  maxImagesPerProduct: 10,
  minImagesPerProduct: 3,
  maxTotalBytes: 150 * 1024 * 1024,
  maxFileBytes: MAX_UPLOAD_BYTES,
} as const;

export const PRODUCT_BULK_IMPORT_MAX_IMAGES =
  PRODUCT_BULK_IMPORT_LIMITS.maxRows *
  PRODUCT_BULK_IMPORT_LIMITS.maxImagesPerProduct;

/**
 * Bir batch bu süreden uzun `processing` kaldıysa işi yürüten süreç ölmüş
 * demektir: HTTP isteği tek süreçte koştuğu için hiçbir şey onu tamamlayamaz.
 * Sınır, en büyük yüklemenin (25 ürün × 10 görsel, AI + S3) gerçekçi üst
 * süresinin epey üstünde tutulur — koşan bir işi asla yarıda kesmemeli.
 */
export const PRODUCT_BULK_IMPORT_STALE_MINUTES = 30;

export const PRODUCT_BULK_IMPORT_MAX_FILES = PRODUCT_BULK_IMPORT_MAX_IMAGES + 1;

export const PRODUCT_BULK_IMPORT_PUBLIC_LIMITS = {
  ...PRODUCT_BULK_IMPORT_LIMITS,
  maxImages: PRODUCT_BULK_IMPORT_MAX_IMAGES,
};
