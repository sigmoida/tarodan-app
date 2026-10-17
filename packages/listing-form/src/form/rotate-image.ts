/** @format */

import {
  browserCanvasDeps,
  fileNameForType,
  normalizeImageType,
  ROTATABLE_TYPES,
  runExclusive,
  type CanvasDeps,
} from "./image-canvas";
import { MAX_IMAGE_BYTES } from "./listing-image-item";
import {
  canDownscaleFile,
  directDecodeSize,
  readJpegInfo,
  scaledDimensions,
} from "./resize-image";

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
 *
 * Çevirme ile yükleme küçültmesi TEK canvas geçişidir: çıktı uzun kenarı
 * `MAX_UPLOAD_DIMENSION`'a (1600) inmiş, YÜKLENMEYE HAZIR dosyadır. Eskiden
 * tam çözünürlükte yeniden kodlanıyordu; büyük bir JPEG 10 MB'ı aşıp
 * "çevrilemedi" diyordu, oysa yükleme adımı onu zaten 1600 px'e indirecekti.
 */

/** Karodaki çevir düğmesi yalnız bunun `true` olduğu kalemlerde çıkar. */
export function canRotateFile(file?: File): boolean {
  return !!file && ROTATABLE_TYPES.includes(normalizeImageType(file.type));
}

/**
 * Kayıplı formatlarda yeniden kodlama kalitesi; kayıpsızlarda kullanılmaz.
 * Yükleme küçültmesinden (0.8) yüksek: aynı görsel art arda çevrildikçe her
 * basış bir kayıplı kodlama daha demek.
 */
export function rotatedOutputQuality(mimeType: string): number | undefined {
  const type = normalizeImageType(mimeType);
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

async function rotate(file: File, deps: CanvasDeps): Promise<File> {
  // JPEG'de başlıktan hedef boyut okunur ve doğrudan o boyutta çözülür —
  // küçültmeyle AYNI kural (`directDecodeSize`; yön 5-8'de tam çözüm). Diğer
  // türlerde ve tarayıcı `resize` seçeneğini desteklemezse tam çözülür,
  // aşağıdaki ölçekleme yine doğru boyutu verir.
  const info = canDownscaleFile(file) ? await readJpegInfo(file) : null;
  const decodeSize = info ? directDecodeSize(info) : undefined;

  let bitmap: ImageBitmap;
  try {
    // Bir tarayıcı `imageOrientation` seçeneğini yok sayarsa da düğme görsel
    // geri bildirimli olduğu için kullanıcı bir kez daha basıp düzeltebilir.
    bitmap = await deps.decode(file, decodeSize);
  } catch {
    throw new RotateImageError("decode");
  }

  try {
    // Hedef, yükleme küçültmesiyle AYNI kural (görüntülenen yönde uzun kenar
    // 1600); zaten küçükse ölçek değişmez.
    const size = scaledDimensions(bitmap.width, bitmap.height) ?? {
      width: bitmap.width,
      height: bitmap.height,
    };
    const type = normalizeImageType(file.type);

    let blob: Blob | null;
    try {
      // 90° çevriliyor: çıktıda en ve boy yer değiştirir.
      blob = await deps.render(bitmap, {
        width: size.height,
        height: size.width,
        type,
        quality: rotatedOutputQuality(type),
        quarterTurn: true,
      });
    } catch {
      blob = null;
    }
    if (!blob) throw new RotateImageError("encode");

    // Ara dosya yok: bu dosya OLDUĞU GİBİ yüklenir, sunucu sınırına burada
    // uymalı. 1600 px'te pratikte yalnız aşırı gürültülü bir PNG aşabilir;
    // sunucudan 400 yemektense kullanıcı nedenini karonun üstünde görür.
    if (blob.size > MAX_IMAGE_BYTES) throw new RotateImageError("tooLarge");

    // Canvas istenen türü kodlayamazsa (eski Safari'de WebP) PNG verir: ad
    // ve tür içeriğin GERÇEK türünü söylemeli.
    const outputType = blob.type ? normalizeImageType(blob.type) : type;
    return new File(
      [blob],
      outputType === type ? file.name : fileNameForType(file.name, outputType),
      { type: outputType, lastModified: file.lastModified },
    );
  } finally {
    bitmap.close?.();
  }
}

/**
 * Dosyayı çevirip yükleme boyutuna indirir. Diğer canvas işleriyle (yükleme
 * küçültmesi) AYNI sıraya girer — aynı anda iki tam çözünürlüklü bitmap yok.
 */
export function rotateImageFile(
  file: File,
  { deps = browserCanvasDeps }: { deps?: CanvasDeps } = {},
): Promise<File> {
  if (!canRotateFile(file)) {
    return Promise.reject(new RotateImageError("unsupported"));
  }
  return runExclusive(() => rotate(file, deps));
}
