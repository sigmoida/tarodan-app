// sharp CJS: servis de `require` ile yüklüyor, spec aynı yolu izler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { configureSharpSafety } from "./sharp-safety";
import { stripImageMetadata } from "./strip-image-metadata";

/**
 * Kullanıcı görselindeki EXIF (GPS, cihaz) sunucuda silinir; yön etiketi
 * silinmeden ÖNCE piksellere uygulanır — dikey fotoğraf yan yatmaz.
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
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(input.includes(MARKER)).toBe(true);

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(out.includes(MARKER)).toBe(false);
    // 40×20 yatay sensör görüntüsü, yön 6 ile 20×40 dikey olur.
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it.each([
    ["png", (img: ReturnType<typeof base>) => img.png()],
    ["webp", (img: ReturnType<typeof base>) => img.webp()],
  ])("%s: EXIF silinir, biçim korunur", async (format, encode) => {
    const input = await encode(
      base().withExif({ IFD0: { Make: MARKER } }),
    ).toBuffer();
    expect(input.includes(MARKER)).toBe(true);

    const out = await stripImageMetadata(safeSharp, input);
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe(format);
    expect(meta.exif).toBeUndefined();
    expect(out.includes(MARKER)).toBe(false);
  });

  it("GIF olduğu gibi döner (sharp'ın GIF yükleyicisi kapalı)", async () => {
    const gif = Buffer.from("GIF89a-not-really-decoded");

    await expect(stripImageMetadata(safeSharp, gif)).resolves.toBe(gif);
  });

  it("çözülemeyen (bozuk) görsel reddedilir", async () => {
    await expect(
      stripImageMetadata(safeSharp, Buffer.from("not an image at all")),
    ).rejects.toThrow();
  });
});
