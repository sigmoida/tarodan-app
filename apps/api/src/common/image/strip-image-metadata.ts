/**
 * Kullanıcı görselinden EXIF / XMP / IPTC meta verisini (özellikle GPS
 * konumu, cihaz bilgisi) siler — yönü KORUYARAK.
 *
 * sharp çıktıya meta veriyi yalnız `keepMetadata()`/`withMetadata()` ile
 * istenirse yazar; yeniden kodlamak onu düşürmenin yoludur. Yön etiketi de
 * meta verinin parçası olduğu için ÖNCE `autoOrient()` ile pikseller
 * çevrilir, yoksa telefon fotoğrafı yan yatmış kalırdı.
 *
 * Çıktı biçimi GİRDİNİN GERÇEK biçimidir (bildirilen MIME değil): JPEG → JPEG,
 * PNG → PNG, WebP → WebP. Böylece depodaki içerik türü ve dosya uzantısı
 * değişmez. Desteklenmeyen biçimler (GIF: sharp'ta güvenlik gereği kapalı,
 * meta verisi de EXIF/GPS taşımaz) olduğu gibi döner.
 */
import type { Sharp } from "sharp";

type SharpFactory = typeof import("sharp");

/** JPEG/WebP yeniden kodlama kalitesi — gözle fark edilmeyecek kadar yüksek. */
const REENCODE_QUALITY = 90;

/** GIF imzası ("GIF8"): sharp'ın GIF yükleyicisi kapalı, dokunulmaz. */
function isGif(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  );
}

function encodeAs(pipeline: Sharp, format: string): Sharp | null {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality: REENCODE_QUALITY });
    case "png":
      return pipeline.png();
    case "webp":
      return pipeline.webp({ quality: REENCODE_QUALITY });
    default:
      return null;
  }
}

/**
 * Meta verisi silinmiş (ve yönü uygulanmış) görsel tamponu. Biçimi
 * desteklenmeyen bir görsel aynen döner; çözülemeyen bir görsel (bozuk
 * dosya) hata fırlatır — çağıran yüklemeyi reddeder.
 */
export async function stripImageMetadata(
  sharpLib: SharpFactory,
  input: Buffer,
): Promise<Buffer> {
  if (isGif(input)) return input;

  const { format, pages } = await sharpLib(input).metadata();
  if (!format) return input;

  // Animasyonlu WebP: kareler korunur. Çok sayfalı görselde döndürme
  // desteklenmez; animasyonlu WebP'de yön etiketi de pratikte yoktur.
  if (format === "webp" && pages && pages > 1) {
    return sharpLib(input, { animated: true })
      .webp({ quality: REENCODE_QUALITY })
      .toBuffer();
  }

  const encoded = encodeAs(sharpLib(input).autoOrient(), format);
  return encoded ? encoded.toBuffer() : input;
}
