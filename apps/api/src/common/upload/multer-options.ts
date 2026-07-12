import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

/**
 * Shared upload cap (#71). File interceptors buffer the whole multipart body
 * before the storage service's 10MB check runs, so without a multer-level
 * `fileSize` limit a large upload is fully read into memory first (memory DoS).
 * Apply these options to every `FileInterceptor(...)` so multer aborts the
 * stream past the cap.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const UPLOAD_MULTER_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_UPLOAD_BYTES },
};
