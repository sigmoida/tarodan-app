// sharp CJS: servis de `require` ile yüklüyor, spec aynı yolu izler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { configureSharpSafety } from "./sharp-safety";
import {
  stripImageMetadata,
  UnsupportedImageError,
} from "./strip-image-metadata";

/**
 * Kullanıcı görselindeki EXIF (GPS, cihaz) sunucuda silinir; yön etiketi
 * silinmeden ÖNCE piksellere uygulanır. Biçim içerikten belirlenir: JPEG/PNG/
 * WebP kalır, başka raster JPEG olur, SVG/çözülemeyen reddedilir; meta
 * verisiz ve dik görsel yeniden kodlanmaz.
 */
const safeSharp = configureSharpSafety(sharp);
const MARKER = "SecretPhone";

function base(width = 40, height = 20) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  });
}

/** Yön 6 (görüntülerken 90° CW) + cihaz + GPS etiketli JPEG. */
async function phoneJpeg(): Promise<Buffer> {
  return base()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: MARKER },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 0/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

describe("stripImageMetadata", () => {
  it("JPEG: EXIF/GPS silinir, yön piksellere uygulanır, biçim JPEG kalır", async () => {
    const input = await phoneJpeg();
    expect(input.includes(MARKER)).toBe(true);

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out.buffer).metadata();

    expect(out).toMatchObject({ mimeType: "image/jpeg", extension: "jpg" });
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(out.buffer.includes(MARKER)).toBe(false);
    // 40×20 yatay sensör görüntüsü, yön 6 ile 20×40 dikey olur.
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it.each([
    ["png", "image/png", (img: ReturnType<typeof base>) => img.png()],
    ["webp", "image/webp", (img: ReturnType<typeof base>) => img.webp()],
  ])("%s: EXIF silinir, biçim korunur", async (format, mimeType, encode) => {
    const input = await encode(
      base().withExif({ IFD0: { Make: MARKER } }),
    ).toBuffer();
    expect(input.includes(MARKER)).toBe(true);

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out.buffer).metadata();

    expect(out.mimeType).toBe(mimeType);
    expect(meta.format).toBe(format);
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.includes(MARKER)).toBe(false);
  });

  it("meta verisiz ve dik görsel YENİDEN KODLANMAZ (aynı tampon döner)", async () => {
    const input = await base().jpeg().toBuffer();

    const out = await stripImageMetadata(safeSharp, input);

    expect(out.buffer).toBe(input);
    expect(out.mimeType).toBe("image/jpeg");
  });

  it("yalnız yön etiketi (EXIF yok sayılsa da ≠1) varsa yine yeniden kodlanır", async () => {
    const input = await base()
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out.buffer).metadata();

    expect(out.buffer).not.toBe(input);
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("JPEG diye gelen AVIF/HEIF: GPS'iyle saklanmaz, JPEG'e çevrilir", async () => {
    const input = await base()
      .withExif({ IFD0: { Make: MARKER } })
      .avif()
      .toBuffer();

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out.buffer).metadata();

    expect(out).toMatchObject({ mimeType: "image/jpeg", extension: "jpg" });
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.includes(MARKER)).toBe(false);
  });

  it("boyutlandırma istenirse meta verisiz görsel de işlenir", async () => {
    const out = await stripImageMetadata(
      safeSharp,
      await base().png().toBuffer(),
      {
        resize: { width: 10, height: 10 },
      },
    );
    const meta = await sharp(out.buffer).metadata();

    expect([meta.width, meta.height, meta.format]).toEqual([10, 10, "png"]);
  });

  it("SVG reddedilir", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );

    await expect(stripImageMetadata(safeSharp, svg)).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
  });

  it("GIF olduğu gibi döner (sharp'ın GIF yükleyicisi kapalı)", async () => {
    const gif = Buffer.from("GIF89a-not-really-decoded");

    await expect(stripImageMetadata(safeSharp, gif)).resolves.toEqual({
      buffer: gif,
      mimeType: "image/gif",
      extension: "gif",
    });
  });

  it("çözülemeyen (bozuk) görsel reddedilir", async () => {
    await expect(
      stripImageMetadata(safeSharp, Buffer.from("not an image at all")),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});
