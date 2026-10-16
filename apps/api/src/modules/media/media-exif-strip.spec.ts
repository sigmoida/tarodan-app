// sharp CJS: servis de `require` ile yüklüyor, spec aynı yolu izler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { MediaService } from "./media.service";

/**
 * `POST /media/upload` boyutlandırmasız yolu (mesaj eki, iade kanıtı,
 * yorum/koleksiyon görseli) eskiden dosyayı HAM yüklüyordu: telefon
 * fotoğrafının GPS konumu alıcıya / herkese açık depoya gidiyordu. Artık her
 * görsel meta verisi silinmiş ve yönü uygulanmış olarak yazılır.
 */
const MARKER = "SecretPhone";

async function phoneJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 40,
      height: 20,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: MARKER },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 0/1 0/1" },
    })
    .jpeg()
    .toBuffer();
}

function fileFrom(buffer: Buffer, mimetype = "image/jpeg") {
  return {
    buffer,
    size: buffer.length,
    mimetype,
    originalname: "photo.jpg",
  } as Express.Multer.File;
}

function createService() {
  const uploaded: Buffer[] = [];
  const options: Array<{ filename: string; mimeType: string }> = [];
  const storageService = {
    uploadFile: jest.fn(
      async (buffer: Buffer, opts: { filename: string; mimeType: string }) => {
        uploaded.push(buffer);
        options.push(opts);
        return {
          key: "k",
          bucket: "messages",
          size: buffer.length,
          mimeType: "image/jpeg",
          mediaFileId: "m1",
        };
      },
    ),
    getPublicAssetUrl: jest.fn(() => "https://cdn.test/k"),
    hasPublicAssetBaseUrl: jest.fn(() => true),
    getPresignedDownloadUrl: jest.fn(async () => "https://signed.test/k"),
  };
  const service = new MediaService(
    {} as never,
    {} as never,
    storageService as never,
    {} as never,
    {} as never,
  );
  return { service, uploaded, options };
}

describe("MediaService.upload — EXIF/GPS silme", () => {
  it.each(["messages", "reviews", "collections", "products"] as const)(
    "boyutlandırmasız %s yüklemesi meta verisiz ve dik yazılır",
    async (bucket) => {
      const { service, uploaded } = createService();

      await service.upload(fileFrom(await phoneJpeg()), { bucket }, "u1");

      const meta = await sharp(uploaded[0]).metadata();
      expect(meta.exif).toBeUndefined();
      expect(uploaded[0].includes(MARKER)).toBe(false);
      expect([meta.width, meta.height]).toEqual([20, 40]);
    },
  );

  it("boyutlandırmalı yol (avatar) da meta veri taşımaz", async () => {
    const { service, uploaded } = createService();

    await service.upload(
      fileFrom(await phoneJpeg()),
      { bucket: "avatars", resize: { width: 10, height: 10 } },
      "u1",
    );

    const meta = await sharp(uploaded[0]).metadata();
    expect(meta.exif).toBeUndefined();
    expect(uploaded[0].includes(MARKER)).toBe(false);
  });

  it("bozuk görsel yüklenmez (ham dosya depoya gitmez)", async () => {
    const { service, uploaded } = createService();

    await expect(
      service.upload(fileFrom(Buffer.from("garbage")), { bucket: "messages" }),
    ).rejects.toThrow();
    expect(uploaded).toHaveLength(0);
  });
  it("JPEG diye gelen AVIF: JPEG olarak, gerçek tür ve uzantıyla yazılır", async () => {
    const { service, uploaded, options } = createService();
    const avif = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#c86432" },
    })
      .withExif({ IFD0: { Make: MARKER } })
      .avif()
      .toBuffer();

    const result = await service.upload(
      fileFrom(avif, "image/jpeg"),
      { bucket: "messages" },
      "u1",
    );

    const meta = await sharp(uploaded[0]).metadata();
    expect(meta.format).toBe("jpeg");
    expect(uploaded[0].includes(MARKER)).toBe(false);
    expect(options[0].mimeType).toBe("image/jpeg");
    expect(options[0].filename).toMatch(/\.jpg$/);
    expect(result.key).toBeTruthy();
  });

  it("SVG (görsel MIME'ıyla) 400 ile reddedilir, depoya gitmez", async () => {
    const { service, uploaded } = createService();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );

    await expect(
      service.upload(fileFrom(svg, "image/png"), { bucket: "messages" }),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.media.unsupportedTypeWithGif" },
    });
    expect(uploaded).toHaveLength(0);
  });

  it("meta verisiz dik JPEG yeniden kodlanmadan aynen yazılır", async () => {
    const { service, uploaded } = createService();
    const clean = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();

    await service.upload(fileFrom(clean), { bucket: "messages" }, "u1");

    expect(uploaded[0].equals(clean)).toBe(true);
  });
});
