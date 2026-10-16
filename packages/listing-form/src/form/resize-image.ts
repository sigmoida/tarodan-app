/** @format */

import { canvasToBlob, decodeOrientedBitmap } from "./image-canvas";

/**
 * Yüklemeden ÖNCE JPEG fotoğrafı tarayıcıda küçültür.
 *
 * Telefon fotoğrafları 4000+ px ve birkaç MB gelir; sunucu en fazla 1200 px
 * saklıyor (`media.service.ts`: detay 1200 inside, kart 500×500). Fazlası
 * yalnızca ağda bekleyen bayttır — yükleme süresinin büyük kısmı buydu.
 * Sunucunun detay ölçüsünün biraz üstünde (1600 px) kalıyoruz ki sunucudaki
 * son küçültme yine kaliteli bir kaynaktan yapılsın.
 *
 * YALNIZ JPEG: PNG/WebP/GIF olduğu gibi gider. JPEG şeffaflık ve animasyon
 * taşımaz, bu yüzden canvas'tan geçirmek içerik kaybettirmez; diğerlerinde alfa
 * ya da animasyon kaybolurdu.
 *
 * Bu adım bir İYİLEŞTİRMEDİR, kapı değil: hangi nedenle olursa olsun
 * küçültülemeyen dosya (başlık okunamadı, HEIC'i çözemeyen tarayıcı, canvas
 * kodlayamadı, sonuç büyüdü, yön belirsiz) SESSİZCE orijinal haliyle devam eder
 * ve `downscaleImageFile` asla fırlatmaz.
 */

/** Uzun kenar bunu aşarsa küçültülür; aşmayan dosyaya dokunulmaz. */
export const MAX_UPLOAD_DIMENSION = 1600;

/** Çıktı JPEG kalitesi. Sunucu zaten WebP'ye çevirir; bu ara format. */
export const UPLOAD_JPEG_QUALITY = 0.8;

const JPEG_TYPES = ["image/jpeg", "image/jpg"];

export function canDownscaleFile(file: Pick<File, "type">): boolean {
  return JPEG_TYPES.includes(file.type.toLowerCase());
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

/**
 * JPEG başlığından okunan HAM bilgi: SOF piksel boyutu ve EXIF yönü.
 * `orientation` 1-8; etiket yoksa 1.
 */
export interface JpegInfo {
  width: number;
  height: number;
  orientation: number;
}

/**
 * SOF ve EXIF segmentleri başlıkta bulunur; tek segment en çok 64 KB olduğu
 * için birkaç büyük segment (ICC profili, EXIF küçük resmi) sonrasında bile
 * SOF bu pencereye sığar.
 */
const JPEG_HEADER_BYTES = 256 * 1024;

const EXIF_ORIENTATION_TAG = 0x0112;

/** APP1 segmentinin (`start`..`end`) EXIF `Orientation` değeri; yoksa `null`. */
function readExifOrientation(
  bytes: Uint8Array,
  start: number,
  end: number,
): number | null {
  const limit = Math.min(end, bytes.length);
  // "Exif\0\0" + TIFF başlığı (8 bayt).
  const isExif = "Exif\0\0"
    .split("")
    .every((char, index) => bytes[start + index] === char.charCodeAt(0));
  const tiff = start + 6;
  if (!isExif || tiff + 8 > limit) return null;

  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49; // "II"
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d; // "MM"
  if (!little && !big) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > limit) return null;

  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > limit) return null;
    if (view.getUint16(entry, little) === EXIF_ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** JPEG başlık baytlarından boyut + yön; JPEG değilse / SOF bulunamazsa `null`. */
export function parseJpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // dolgu baytı
      continue;
    }
    // Bağımsız işaretler (TEM, RSTn) uzunluk taşımaz.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // EOI ya da SOS: SOF görülmeden görüntü verisine girildi.
    if (marker === 0xd9 || marker === 0xda) return null;

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;

    // SOF0-15; DHT (C4), JPG (C8) ve DAC (CC) çerçeve başlığı DEĞİLDİR.
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > bytes.length) return null;
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height, orientation } : null;
    }
    if (marker === 0xe1) {
      orientation =
        readExifOrientation(bytes, offset + 4, offset + 2 + length) ??
        orientation;
    }
    offset += 2 + length;
  }
  return null;
}

/** EXIF yönü 5-8 ise görüntülenen en/boy ham SOF boyutunun TERSİDİR. */
const swapsAxes = (orientation: number): boolean => orientation >= 5;

/** Tarayıcı tesisatı — testlerde değiştirilir (jsdom'da canvas yok). */
export interface DownscaleDeps {
  /** `resize` verilirse tarayıcı destekliyorsa doğrudan o boyutta çözer. */
  decode(
    file: Blob,
    resize?: { width: number; height: number },
  ): Promise<ImageBitmap>;
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
    try {
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      return await canvasToBlob(canvas, "image/jpeg", UPLOAD_JPEG_QUALITY);
    } finally {
      // Canvas arka belleğini hemen bırak (iOS Safari toplam canvas belleğini
      // sınırlar; GC'yi beklemek sonraki dosyaları çökertebilir).
      canvas.width = 0;
      canvas.height = 0;
    }
  },
};

/**
 * Küçültme adımları TEK SEFERDE BİR dosya çalışır. Kuyruk 3 yüklemeyi paralel
 * yürütür; üç tam çözünürlüklü bitmap'i aynı anda tutmak iOS Safari'de sekmeyi
 * öldürebiliyor (form kaybolur). Yüklemeler paralel kalır, yalnız
 * decode/encode burada sıraya girer.
 */
let exclusiveTail: Promise<unknown> = Promise.resolve();
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = exclusiveTail.then(task, task);
  exclusiveTail = run.catch(() => undefined);
  return run;
}

async function downscale(file: File, deps: DownscaleDeps): Promise<File> {
  const header = new Uint8Array(
    await file.slice(0, JPEG_HEADER_BYTES).arrayBuffer(),
  );
  const info = parseJpegInfo(header);
  if (!info) return file;

  const rotated = swapsAxes(info.orientation);
  // Hedef boyut GÖRÜNTÜLENEN yönde hesaplanır (kullanıcının önizlemede gördüğü).
  const size = scaledDimensions(
    rotated ? info.height : info.width,
    rotated ? info.width : info.height,
  );
  // Zaten yeterince küçük: yeniden kodlamak yalnız kalite kaybettirir.
  if (!size) return file;

  // Yön 5-8'de tarayıcının yönü uyguladığı, bitmap boyutundan ayırt edilmeli;
  // bu yüzden bu durumda hedef boyutla değil TAM çözülür (uygulanmışsa bitmap
  // görüntülenen yöndedir, uygulanmamışsa ham boyuttadır).
  const bitmap = await deps.decode(file, rotated ? undefined : size);
  try {
    // Tarayıcı `imageOrientation`'ı yok saymış: canvas'a yan çizilir ve
    // sunucunun EXIF'e güvenen `autoOrient`i de artık işe yaramaz (JPEG'i
    // yeniden kodlayınca EXIF düşer). Orijinal gitsin, sunucu yönlendirsin.
    if (
      rotated &&
      info.width !== info.height &&
      bitmap.width === info.width &&
      bitmap.height === info.height
    ) {
      return file;
    }

    const blob = await deps.render(bitmap, size);
    // Küçülmeyen sonuç (zaten sıkıştırılmış JPEG) kazanç değil.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], downscaledFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
}

/**
 * Gerekirse küçültülmüş dosyayı döner; gerekmiyorsa ya da başarısızsa ORİJİNAL
 * dosyayı. Asla fırlatmaz.
 */
export function downscaleImageFile(
  file: File,
  deps: DownscaleDeps = browserDeps,
): Promise<File> {
  if (!canDownscaleFile(file)) return Promise.resolve(file);
  return runExclusive(() => downscale(file, deps)).catch(() => file);
}
