/** @format */

/**
 * YALNIZ TESTLER İÇİN: başlığı gerçek bir JPEG gibi okunan küçük dosyalar
 * (SOI + isteğe bağlı EXIF yönü + SOF + dolgu). Küçültme ve çevirme testleri
 * aynı başlık okuyucusunu (`parseJpegInfo`) besler; üretici tek yerde.
 */

const u16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];

/** Minimal EXIF APP1 segmenti: tek girişli IFD0 (Orientation). */
function exifSegment(orientation: number, littleEndian: boolean): number[] {
  const short = (value: number) =>
    littleEndian ? [value & 0xff, (value >> 8) & 0xff] : u16(value);
  const long = (value: number) =>
    littleEndian
      ? [value & 0xff, (value >> 8) & 0xff, 0, 0]
      : [0, 0, ...u16(value)];
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...short(0x002a),
    ...long(8), // IFD0 ofseti
    ...short(1), // giriş sayısı
    ...short(0x0112), // tag
    ...short(3), // tür: SHORT
    ...long(1), // adet
    ...short(orientation),
    0,
    0, // değer alanı dolgusu
    0,
    0,
    0,
    0, // sonraki IFD yok
  ];
  const body = [..."Exif\0\0".split("").map((c) => c.charCodeAt(0)), ...tiff];
  return [0xff, 0xe1, ...u16(body.length + 2), ...body];
}

/** SOI + (isteğe bağlı EXIF) + SOF + dolgu. `progressive` SOF2 kullanır. */
export function jpegBytes(options: {
  width: number;
  height: number;
  orientation?: number;
  littleEndian?: boolean;
  progressive?: boolean;
  padding?: number;
}): number[] {
  const { width, height, orientation, littleEndian = false } = options;
  return [
    0xff,
    0xd8,
    ...(orientation ? exifSegment(orientation, littleEndian) : []),
    0xff,
    options.progressive ? 0xc2 : 0xc0,
    ...u16(11),
    8,
    ...u16(height),
    ...u16(width),
    1,
    1,
    0x11,
    0,
    ...Array(options.padding ?? 4096).fill(7),
  ];
}

export const jpegFile = (
  options: Parameters<typeof jpegBytes>[0],
  name = "p.jpg",
  type = "image/jpeg",
) =>
  new File([new Uint8Array(jpegBytes(options))], name, {
    type,
    lastModified: 42,
  });
