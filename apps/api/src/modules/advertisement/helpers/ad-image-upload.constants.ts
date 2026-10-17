import type { UploadOptions } from "../../media/media.service";

/**
 * Reklam görseli yükleme hedefi — TEK tanım. Hem `POST /admin/ads/upload`
 * (yalnız `ads` izni) hem geriye dönük `POST /admin/media/upload` (amaç
 * belirtilmemişse) bunu kullanır; klasör/tür/boyut iki yerde ayrışamaz.
 *
 * Public `products` kökü: banner'lar kalıcı public URL ile web'de render
 * edilir.
 */
export const AD_IMAGE_UPLOAD: UploadOptions = {
  bucket: "products",
  folder: "ads",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024, // 5MB
};
