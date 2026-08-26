// sharp CJS: servis de `require` ile yüklüyor, spec aynı yolu izler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { MediaService } from "./media.service";

/**
 * Telefonla dikey çekilen fotoğraflar EXIF `Orientation` etiketiyle gelir;
 * piksel sırası sensör sırasındadır ve etiket "görüntülerken çevir" der.
 *
 * sharp bu etiketi KENDİLİĞİNDEN uygulamaz ve çıktı WebP'ye çevrildiği için
 * etiket de düşer — yani düzeltilmezse yön bilgisi tamamen kaybolur, tarayıcı
 * da artık kurtaramaz. Bu yüzden zincirin başında `autoOrient()` şart.
 */

/** `Orientation` etiketi taşıyan yatay JPEG. 6 = görüntülerken 90° CW çevir. */
async function jpegWithOrientation(
  width: number,
  height: number,
  orientation: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

function createService(): {
  service: MediaService;
  uploaded: Buffer[];
} {
  const uploaded: Buffer[] = [];
  const storageService = {
    uploadFile: jest.fn(async (buffer: Buffer) => {
      uploaded.push(buffer);
      return { key: `key-${uploaded.length}` };
    }),
    getPublicAssetUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  };
  const service = new MediaService(
    {} as never, // ConfigService — bu yolda kullanılmıyor
    {} as never, // MembershipService
    storageService as never,
    {} as never, // PrismaService
  );
  return { service, uploaded };
}

function fileFrom(buffer: Buffer): Express.Multer.File {
  return {
    buffer,
    size: buffer.length,
    mimetype: "image/jpeg",
    originalname: "photo.jpg",
  } as Express.Multer.File;
}

describe("MediaService — EXIF yönlendirmesi", () => {
  it("dikey çekilmiş ürün fotoğrafını düz üretir", async () => {
    const { service, uploaded } = createService();
    // Sensörden 40×20 yatay çıkıyor; etiket "90° çevir" diyor, yani KULLANICI
    // bunu 20×40 dikey olarak görüyor ve öyle yüklediğini sanıyor.
    const file = fileFrom(await jpegWithOrientation(40, 20, 6));

    await service.uploadProductImageVariants(file, "user-1");

    // İkinci yükleme detay görseli: `fit: "inside"` en-boy oranını koruduğu
    // için yön düzeltilmişse çıktı DİKEY olmalı.
    const detail = await sharp(uploaded[1]).metadata();
    expect(detail.height).toBeGreaterThan(detail.width);
  });

  it("etiket taşımayan fotoğrafın yönünü değiştirmez", async () => {
    const { service, uploaded } = createService();
    const file = fileFrom(await jpegWithOrientation(40, 20, 1));

    await service.uploadProductImageVariants(file, "user-1");

    const detail = await sharp(uploaded[1]).metadata();
    expect(detail.width).toBeGreaterThan(detail.height);
  });

  it("avatar/thumbnail yolunda da yönü düzeltir", async () => {
    const { service, uploaded } = createService();
    const file = fileFrom(await jpegWithOrientation(40, 20, 6));

    await service.upload(file, {
      bucket: "avatars",
      resize: { width: 300, height: 300, fit: "inside" },
    });

    const avatar = await sharp(uploaded[0]).metadata();
    expect(avatar.height).toBeGreaterThan(avatar.width);
  });
});
