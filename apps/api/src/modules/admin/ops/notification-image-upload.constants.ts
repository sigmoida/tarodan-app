import type { UploadOptions } from "../../media/media.service";

/**
 * Bildirim görseli (push / e-posta gövdesi) yükleme hedefi — TEK tanım
 * (`POST /admin/notifications/upload`, yalnız `notifications` izni).
 *
 * Public `products` kökü, `notifications/` klasörü: görsel kalıcı public URL ile
 * cihazlarda ve e-posta istemcilerinde açılır — presigned URL süresi dolunca
 * geçmiş bildirimin görseli kırılırdı. Reklam banner'ıyla (`AD_IMAGE_UPLOAD`)
 * aynı tür/boyut sınırları.
 */
export const NOTIFICATION_IMAGE_UPLOAD: UploadOptions = {
  bucket: "products",
  folder: "notifications",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 5MB
};
