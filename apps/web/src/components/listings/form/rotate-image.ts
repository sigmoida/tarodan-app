/** @format */

import { MAX_IMAGE_BYTES } from "./listing-image-item";

/**
 * Seçilen fotoğrafı 90° çevirir.
 *
 * Sunucu artık EXIF `Orientation` etiketini uyguluyor (`media.service.ts`
 * `autoOrient()`), ama etiketi HİÇ olmayan dosyalarda (ekran görüntüsü,
 * WhatsApp'tan gelen, bazı düzenleme uygulamalarından çıkan) düzeltilecek bir
 * bilgi yoktur. Bu yardımcı o boşluğu kapatır: kullanıcı karodan çevirir,
 * dosya yeniden yüklenir.
 *
 * Döndürülen dosyada EXIF BULUNMAZ; yani sunucudaki `autoOrient()` onun için
 * etkisiz kalır ve iki düzeltme birbirini çift çevirmez.
 */

/**
 * Canvas animasyonu düzleştirdiği için GIF çevrilemez — sessizce bozmaktansa
 * seçeneği hiç sunmuyoruz. (`ACCEPTED_IMAGE_TYPES` gif'i kabul ediyor.)
 */
const ROTATABLE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Karodaki çevir düğmesi yalnız bunun `true` olduğu kalemlerde çıkar. */
export function canRotateFile(file?: File): boolean {
  return !!file && ROTATABLE_TYPES.includes(file.type.toLowerCase());
}

/**
 * `canvas.toBlob` "image/jpg" bilmez — tanımadığı türde sessizce PNG'ye düşer
 * ve dosya adı ile içeriği ayrışırdı.
 */
export function rotatedOutputType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

/** Kayıplı formatlarda yeniden kodlama kalitesi; kayıpsızlarda kullanılmaz. */
export function rotatedOutputQuality(mimeType: string): number | undefined {
  const type = rotatedOutputType(mimeType);
  return type === "image/jpeg" || type === "image/webp" ? 0.92 : undefined;
}

/** Çevirme başarısızlıklarını çağıranın ayırt edebilmesi için. */
export type RotateFailureReason =
  "unsupported" | "decode" | "encode" | "tooLarge";

export class RotateImageError extends Error {
  constructor(readonly reason: RotateFailureReason) {
    super(`rotate-image: ${reason}`);
    this.name = "RotateImageError";
  }
}

export async function rotateImageFile(file: File): Promise<File> {
  if (!canRotateFile(file)) throw new RotateImageError("unsupported");

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation` AÇIKÇA verilir: canvas'ın, kullanıcının önizlemede
    // gördüğü hâli alması gerekir. Varsayılan tarayıcılar arasında tutarsızdı;
    // bir tarayıcı seçeneği yok sayarsa da düğme görsel geri bildirimli olduğu
    // için kullanıcı bir kez daha basıp düzeltebilir.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new RotateImageError("decode");
  }

  try {
    const canvas = document.createElement("canvas");
    // 90° çeviriyoruz: en ve boy yer değiştirir.
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;

    const context = canvas.getContext("2d");
    if (!context) throw new RotateImageError("encode");

    // Saat yönünde 90°: önce sağ üst köşeye taşı, sonra döndür.
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(bitmap, 0, 0);

    const type = rotatedOutputType(file.type);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, rotatedOutputQuality(file.type)),
    );
    if (!blob) throw new RotateImageError("encode");

    // Yeniden kodlama JPEG'i büyütebilir. Sunucudan 400 yemektense burada
    // yakalanır — kullanıcı ne olduğunu karonun üstünde görür.
    if (blob.size > MAX_IMAGE_BYTES) throw new RotateImageError("tooLarge");

    return new File([blob], file.name, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
