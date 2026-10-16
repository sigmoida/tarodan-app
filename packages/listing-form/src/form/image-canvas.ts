/** @format */

import { abortError, throwIfAborted } from "./abort";

/**
 * Tarayıcıda canvas ile görsel işleyen yardımcıların ORTAK tesisatı.
 *
 * Çevirme (`rotate-image.ts`) ve yükleme öncesi küçültme (`resize-image.ts`)
 * aynı adımlara ihtiyaç duyar: hangi türe dokunulabileceği, dosyayı
 * kullanıcının önizlemede gördüğü yönde çözmek, canvas'a çizip bir `Blob`'a
 * yazmak ve bu işi TEK SEFERDE BİR dosya yapmak. İkisi ayrı ayrı yazılırsa
 * yön, format ya da bellek kuralı bir yerde değişip diğerinde kalırdı.
 */

/**
 * MIME tipinin karşılaştırılacak biçimi: küçük harf ve `image/jpg` →
 * `image/jpeg`. `image/jpg` standart değildir ama bazı tarayıcı/işletim
 * sistemleri dosyaya onu yazar; `canvas.toBlob` ise onu bilmez ve sessizce
 * PNG'ye düşer (dosya adı ile içerik ayrışırdı).
 */
export function normalizeImageType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

/**
 * Yükleme öncesi küçültülen türler (normalize edilmiş). YALNIZ JPEG: şeffaflık
 * ve animasyon taşımadığı için canvas'tan geçirmek içerik kaybettirmez;
 * PNG/WebP/GIF'te alfa ya da animasyon kaybolurdu.
 */
export const DOWNSCALABLE_TYPES: readonly string[] = ["image/jpeg"];

/**
 * Karodan çevrilebilen türler (normalize edilmiş). GIF YOK: canvas animasyonu
 * düzleştirir — sessizce bozmaktansa seçeneği hiç sunmuyoruz
 * (`ACCEPTED_IMAGE_TYPES` gif'i kabul ediyor).
 */
export const ROTATABLE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/**
 * Dosyayı EXIF yönü uygulanmış hâliyle çözer.
 *
 * `imageOrientation` AÇIKÇA verilir: canvas'ın, kullanıcının önizlemede
 * gördüğü hâli alması gerekir. Varsayılan tarayıcılar arasında tutarsızdı.
 * Çözülemezse (desteklenmeyen format, eski tarayıcı) `createImageBitmap`'in
 * hatasını AYNEN fırlatır; ne yapılacağına çağıran karar verir.
 *
 * `resize` verilirse çözme DOĞRUDAN hedef boyutta yapılır (tam çözünürlüklü
 * bitmap hiç oluşmaz; mobil tarayıcıda bellek farkı büyüktür). Seçeneği
 * desteklemeyen tarayıcı onu yok sayıp tam boyutlu bitmap döner — çağıran
 * bitmap'i hedef boyuta çizdiği için sonuç yine doğrudur.
 */
export function decodeOrientedBitmap(
  file: Blob,
  resize?: { width: number; height: number },
): Promise<ImageBitmap> {
  return createImageBitmap(file, {
    imageOrientation: "from-image",
    ...(resize
      ? {
          resizeWidth: resize.width,
          resizeHeight: resize.height,
          resizeQuality: "high" as const,
        }
      : {}),
  });
}

/**
 * `canvas.toBlob` Promise döndürmez ve kodlayamazsa `null` verir; ikisini de
 * tek yerde sarar.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Tek canvas geçişinin çıktısı. */
export interface RenderOptions {
  /** ÇIKTI boyutu (çevrilecekse çevrilmiş yönde). */
  width: number;
  height: number;
  /** Normalize edilmiş MIME tipi (`normalizeImageType`). */
  type: string;
  /** Kayıplı formatlarda kodlama kalitesi. */
  quality?: number;
  /**
   * Saat yönünde 90° çevir. Çevirme ile ölçekleme AYNI çizimde yapılır: ayrı
   * bir geçiş tam çözünürlükte bir ara dosya daha kodlamak demekti.
   */
  quarterTurn?: boolean;
}

/** Bitmap'i istenen boyutta (gerekirse çevirerek) çizip kodlar; kodlayamazsa `null`. */
export async function renderBitmap(
  bitmap: ImageBitmap,
  { width, height, type, quality, quarterTurn = false }: RenderOptions,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    if (quarterTurn) {
      // Önce sağ üst köşeye taşı, sonra döndür: çizim ekseni yer değiştirir,
      // bitmap çevrilmemiş yönde (height × width) alana çizilir.
      context.translate(width, 0);
      context.rotate(Math.PI / 2);
      context.drawImage(bitmap, 0, 0, height, width);
    } else {
      context.drawImage(bitmap, 0, 0, width, height);
    }
    return await canvasToBlob(canvas, type, quality);
  } finally {
    // Canvas arka belleğini hemen bırak (iOS Safari toplam canvas belleğini
    // sınırlar; GC'yi beklemek sonraki dosyaları çökertebilir).
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Tarayıcı tesisatı — testlerde değiştirilir (jsdom'da canvas yok). */
export interface CanvasDeps {
  /** `resize` verilirse tarayıcı destekliyorsa doğrudan o boyutta çözer. */
  decode(
    file: Blob,
    resize?: { width: number; height: number },
  ): Promise<ImageBitmap>;
  render(bitmap: ImageBitmap, options: RenderOptions): Promise<Blob | null>;
}

export const browserCanvasDeps: CanvasDeps = {
  decode: decodeOrientedBitmap,
  render: renderBitmap,
};

/**
 * Canvas işleri TEK SEFERDE BİR dosya çalışır — küçültme de çevirme de bu
 * sıraya girer. Kuyruk 3 yüklemeyi paralel yürütür; üç tam çözünürlüklü
 * bitmap'i aynı anda tutmak iOS Safari'de sekmeyi öldürebiliyor (form
 * kaybolur). Yüklemeler paralel kalır, yalnız decode/encode sıraya girer.
 *
 * `signal` verilirse sırada BEKLEYEN iş iptal anında bırakılır: çağıran sırası
 * gelmeden serbest kalır (kuyruk slotunu tutmaz) ve sırası geldiğinde iş hiç
 * başlamaz (boşuna decode yok). Çalışmakta olan işi durdurmak işin kendi
 * sorumluluğudur (adımlar arasında `throwIfAborted`).
 */
let exclusiveTail: Promise<unknown> = Promise.resolve();
export function runExclusive<T>(
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const run = exclusiveTail.then(() => {
    throwIfAborted(signal);
    return task();
  });
  exclusiveTail = run.catch(() => undefined);
  return signal ? releaseOnAbort(run, signal) : run;
}

/** `promise`'i bekler ama `signal` iptal olursa hemen `AbortError` ile reddeder. */
function releaseOnAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}
