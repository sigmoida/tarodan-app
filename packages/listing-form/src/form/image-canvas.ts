/** @format */

/**
 * Tarayıcıda canvas ile görsel işleyen yardımcıların ORTAK tesisatı.
 *
 * Çevirme (`rotate-image.ts`) ve yükleme öncesi küçültme (`resize-image.ts`)
 * aynı iki adıma ihtiyaç duyar: dosyayı kullanıcının önizlemede gördüğü yönde
 * çözmek ve canvas'ı bir `Blob`'a yazmak. İkisi ayrı ayrı yazılırsa yön ya da
 * format kuralı bir yerde değişip diğerinde kalırdı.
 */

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
