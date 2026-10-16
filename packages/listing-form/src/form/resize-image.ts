/** @format */

import { canvasToBlob, decodeOrientedBitmap } from "./image-canvas";

/**
 * Yüklemeden ÖNCE fotoğrafı tarayıcıda küçültür.
 *
 * Telefon fotoğrafları 4000+ px ve birkaç MB gelir; sunucu en fazla 1200 px
 * saklıyor (`media.service.ts`: kart 500×500, detay 1200 inside). Fazlası
 * yalnızca ağda bekleyen bayttır — yükleme süresinin büyük kısmı buydu.
 * Sunucunun detay ölçüsünün biraz üstünde (1600 px) kalıyoruz ki sunucudaki
 * son küçültme yine kaliteli bir kaynaktan yapılsın.
 *
 * Bu adım bir İYİLEŞTİRMEDİR, kapı değil: hangi nedenle olursa olsun
 * küçültülemeyen dosya (HEIC'i çözemeyen tarayıcı, `createImageBitmap` yok,
 * canvas kodlayamadı, sonuç büyüdü) SESSİZCE orijinal haliyle devam eder ve
 * `downscaleImageFile` asla fırlatmaz.
 */

/** Uzun kenar bunu aşarsa küçültülür; aşmayan dosyaya dokunulmaz. */
export const MAX_UPLOAD_DIMENSION = 1600;

/** Çıktı JPEG kalitesi. Sunucu zaten WebP'ye çevirir; bu ara format. */
export const UPLOAD_JPEG_QUALITY = 0.8;

/**
 * Canvas animasyonu düzleştirdiği için GIF'e dokunulmaz (`rotate-image.ts` ile
 * aynı gerekçe). Animasyonlu WebP/APNG içerik taramasıyla ayrıca yakalanır.
 */
const DOWNSCALABLE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export function canDownscaleFile(file: Pick<File, "type">): boolean {
  return DOWNSCALABLE_TYPES.includes(file.type.toLowerCase());
}

/**
 * Uzun kenarı `max`'a indiren yeni boyut; küçültme GEREKMİYORSA `null`.
 * En-boy oranı korunur, her kenar en az 1 px kalır.
 */
export function scaledDimensions(
  width: number,
  height: number,
  max: number = MAX_UPLOAD_DIMENSION,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const longest = Math.max(width, height);
  if (longest <= max) return null;
  const ratio = max / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Çıktı JPEG olduğu için uzantı da öyle olmalı; ad/içerik ayrışmasın. */
export function downscaledFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}

const ascii = (bytes: Uint8Array, start: number, text: string): boolean =>
  text
    .split("")
    .every((char, index) => bytes[start + index] === char.charCodeAt(0));

/** APNG'de `acTL` parçası ilk `IDAT`'tan önce gelir; ilk birkaç KB yeter. */
const ANIMATION_SNIFF_BYTES = 4096;

/**
 * Dosya animasyonlu mu — YA DA okunamadı mı (bilinmiyorsa dokunmayız).
 *
 *  - animasyonlu WebP: `RIFF....WEBPVP8X` ve bayrak baytında (20) animasyon biti;
 *  - APNG: ilk baytlarda `acTL` parçası.
 */
async function mayBeAnimated(file: Blob): Promise<boolean> {
  try {
    const bytes = new Uint8Array(
      await file.slice(0, ANIMATION_SNIFF_BYTES).arrayBuffer(),
    );
    if (
      ascii(bytes, 0, "RIFF") &&
      ascii(bytes, 8, "WEBP") &&
      ascii(bytes, 12, "VP8X")
    ) {
      return (bytes[20] & 0x02) !== 0;
    }
    for (let i = 0; i + 4 <= bytes.length; i += 1) {
      if (ascii(bytes, i, "acTL")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Tarayıcı tesisatı — testlerde değiştirilir (jsdom'da canvas yok). */
export interface DownscaleDeps {
  decode(file: Blob): Promise<ImageBitmap>;
  render(
    bitmap: ImageBitmap,
    size: { width: number; height: number },
  ): Promise<Blob | null>;
}

const browserDeps: DownscaleDeps = {
  decode: decodeOrientedBitmap,
  async render(bitmap, { width, height }) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // JPEG şeffaflık taşımaz; PNG/WebP'nin saydam alanı siyaha dönmesin.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    return canvasToBlob(canvas, "image/jpeg", UPLOAD_JPEG_QUALITY);
  },
};

/**
 * Gerekirse küçültülmüş dosyayı döner; gerekmiyorsa ya da başarısızsa ORİJİNAL
 * dosyayı. Asla fırlatmaz.
 */
export async function downscaleImageFile(
  file: File,
  deps: DownscaleDeps = browserDeps,
): Promise<File> {
  try {
    if (!canDownscaleFile(file) || (await mayBeAnimated(file))) return file;

    const bitmap = await deps.decode(file);
    try {
      const size = scaledDimensions(bitmap.width, bitmap.height);
      // Zaten yeterince küçük: yeniden kodlamak yalnız kalite kaybettirir.
      if (!size) return file;

      const blob = await deps.render(bitmap, size);
      // Küçülmeyen sonuç (nadir ama olur: zaten sıkıştırılmış JPEG) kazanç değil.
      if (!blob || blob.size >= file.size) return file;

      return new File([blob], downscaledFileName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close?.();
    }
  } catch {
    return file;
  }
}
