/**
 * Kullanıcı görselinden EXIF / XMP / IPTC / PNG metin meta verisini (özellikle
 * GPS konumu, cihaz bilgisi) siler — yönü KORUYARAK.
 *
 * sharp çıktıya meta veriyi yalnız `keepMetadata()`/`withMetadata()` ile
 * istenirse yazar; yeniden kodlamak onu düşürmenin yoludur. Yön etiketi de
 * meta verinin parçası olduğu için ÖNCE `autoOrient()` ile pikseller
 * çevrilir, yoksa telefon fotoğrafı yan yatmış kalırdı.
 *
 * Biçim, BİLDİRİLEN MIME'a değil içeriğe göre belirlenir (istemci MIME'ı
 * keyfidir; JPEG diye gönderilen bir AVIF de olabilir):
 *  - JPEG / PNG / WebP → aynı biçimde kalır;
 *  - çözülebilen başka her raster (HEIF/AVIF, JPEG 2000 …) → JPEG'e çevrilir;
 *  - GIF → olduğu gibi (sharp'ın GIF yükleyicisi güvenlik gereği kapalı, GIF
 *    EXIF/GPS taşımaz);
 *  - SVG ya da çözülemeyen içerik → `UnsupportedImageError` (çağıran 400 verir).
 *
 * Meta verisi olmayan ve yönü zaten doğru (1 / yok) bir görsel, boyutlandırma
 * da istenmiyorsa YENİDEN KODLANMAZ — gereksiz kalite kaybı ve CPU olmasın.
 */
import type { ResizeOptions, Sharp } from "sharp";

type SharpFactory = typeof import("sharp");

/** Görsel olarak işlenemeyen (SVG, bozuk, biçimi bilinmeyen) içerik. */
export class UnsupportedImageError extends Error {
  constructor(reason: string) {
    super(`Unsupported image: ${reason}`);
    this.name = "UnsupportedImageError";
  }
}

/** İşlenmiş görsel: depoya yazılacak tampon + GERÇEK içerik türü/uzantısı. */
export interface PreparedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

type OutputFormat = "jpeg" | "png" | "webp";

const OUTPUT: Record<
  OutputFormat | "gif",
  { mimeType: string; extension: string }
> = {
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
  gif: { mimeType: "image/gif", extension: "gif" },
};

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

function isKeptFormat(format: string): format is OutputFormat {
  return format === "jpeg" || format === "png" || format === "webp";
}

function encodeAs(pipeline: Sharp, format: OutputFormat): Sharp {
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality: REENCODE_QUALITY });
    case "png":
      return pipeline.png();
    case "webp":
      return pipeline.webp({ quality: REENCODE_QUALITY });
  }
}

export interface PrepareImageOptions {
  /** Verilirse yön uygulandıktan sonra boyutlandırılır (avatar vb.). */
  resize?: Pick<
    ResizeOptions,
    "width" | "height" | "fit" | "withoutEnlargement"
  >;
}

function resizeArgs(
  resize: NonNullable<PrepareImageOptions["resize"]>,
): ResizeOptions {
  return {
    width: resize.width,
    height: resize.height,
    fit: resize.fit || "cover",
    withoutEnlargement: resize.withoutEnlargement,
  };
}

/**
 * Meta verisi silinmiş, yönü uygulanmış (ve istenirse boyutlandırılmış)
 * görsel. SVG/çözülemeyen içerikte `UnsupportedImageError` fırlatır.
 */
export async function stripImageMetadata(
  sharpLib: SharpFactory,
  input: Buffer,
  options: PrepareImageOptions = {},
): Promise<PreparedImage> {
  if (isGif(input)) return { buffer: input, ...OUTPUT.gif };

  let meta: Awaited<ReturnType<Sharp["metadata"]>>;
  try {
    meta = await sharpLib(input).metadata();
  } catch {
    throw new UnsupportedImageError("undecodable");
  }
  const format: string | undefined = meta.format;
  if (!format) throw new UnsupportedImageError("unknown format");
  if (format === "svg") throw new UnsupportedImageError("svg");

  const target: OutputFormat = isKeptFormat(format) ? format : "jpeg";
  const { resize } = options;
  const hasMetadata =
    !!meta.exif ||
    !!meta.xmp ||
    !!meta.iptc ||
    !!meta.comments?.length ||
    (meta.orientation ?? 1) !== 1;

  if (!resize && target === format && !hasMetadata) {
    return { buffer: input, ...OUTPUT[target] };
  }

  // Animasyonlu WebP: kareler korunur. Çok sayfalı görselde döndürme
  // desteklenmez; animasyonlu WebP'de yön etiketi de pratikte yoktur.
  if (format === "webp" && meta.pages && meta.pages > 1) {
    let pipeline = sharpLib(input, { animated: true });
    if (resize) pipeline = pipeline.resize(resizeArgs(resize));
    return {
      buffer: await encodeAs(pipeline, "webp").toBuffer(),
      ...OUTPUT.webp,
    };
  }

  let pipeline = sharpLib(input).autoOrient();
  if (resize) pipeline = pipeline.resize(resizeArgs(resize));
  return {
    buffer: await encodeAs(pipeline, target).toBuffer(),
    ...OUTPUT[target],
  };
}
