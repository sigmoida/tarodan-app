import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";

/**
 * Shared upload cap (#71). File interceptors buffer the whole multipart body
 * before the storage service's 10MB check runs, so without a multer-level
 * `fileSize` limit a large upload is fully read into memory first (memory DoS).
 * Apply these options to every `FileInterceptor(...)` so multer aborts the
 * stream past the cap.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB — largest file we accept (inclusive)

export const UPLOAD_MULTER_OPTIONS: MulterOptions = {
  // multer/busboy aborts the stream once a file part reaches `fileSize` bytes, so
  // a file of exactly MAX_UPLOAD_BYTES would be rejected. Add one byte so the
  // documented 10MB max stays inclusive — matching the app-level `size > MAX`
  // checks in media/storage services. MAX_UPLOAD_BYTES + 1 bytes and above still
  // abort the stream (413 Payload Too Large) before the body is buffered.
  limits: { fileSize: MAX_UPLOAD_BYTES + 1 },
};
