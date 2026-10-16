// sharp CJS: servis de `require` ile yüklüyor, spec aynı yolu izler.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require("sharp");
import { ServiceUnavailableException } from "@nestjs/common";
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
  /** Dosya adına göre yüklenen tampon — kart/detay artık paralel, SIRA garanti değil. */
  byFilename: (suffix: "card" | "detail") => Buffer;
} {
  const uploaded: Buffer[] = [];
  const names: string[] = [];
  const storageService = {
    uploadFile: jest.fn(
      async (buffer: Buffer, options: { filename: string }) => {
        uploaded.push(buffer);
        names.push(options.filename);
        return { key: `key-${options.filename}` };
      },
    ),
    getPublicAssetUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
    hasPublicAssetBaseUrl: jest.fn(() => true),
  };
  const service = new MediaService(
    {} as never, // ConfigService — bu yolda kullanılmıyor
    {} as never, // MembershipService
    storageService as never,
    {} as never, // PrismaService
  );
  const byFilename = (suffix: "card" | "detail") =>
    uploaded[names.findIndex((name) => name.endsWith(`-${suffix}.webp`))];
  return { service, uploaded, byFilename };
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
    const { service, byFilename } = createService();
    // Sensörden 40×20 yatay çıkıyor; etiket "90° çevir" diyor, yani KULLANICI
    // bunu 20×40 dikey olarak görüyor ve öyle yüklediğini sanıyor.
    const file = fileFrom(await jpegWithOrientation(40, 20, 6));

    await service.uploadProductImageVariants(file, "user-1");

    // Detay görseli: `fit: "inside"` en-boy oranını koruduğu için yön
    // düzeltilmişse çıktı DİKEY olmalı.
    const detail = await sharp(byFilename("detail")).metadata();
    expect(detail.height).toBeGreaterThan(detail.width);
  });

  it("kartı detay tamponundan üretir: 500×500 cover, yön yine düzgün", async () => {
    const { service, byFilename } = createService();
    // Kart `autoOrient`siz, detaydan türetilir; detay zaten yönlendirildiği
    // için kart da dikey kaynağın kırpılmışı olmalı (500×500, bozulmamış).
    const file = fileFrom(await jpegWithOrientation(80, 40, 6));

    await service.uploadProductImageVariants(file, "user-1");

    const card = await sharp(byFilename("card")).metadata();
    expect(card.width).toBe(500);
    expect(card.height).toBe(500);
    expect(card.format).toBe("webp");
  });

  it("etiket taşımayan fotoğrafın yönünü değiştirmez", async () => {
    const { service, byFilename } = createService();
    const file = fileFrom(await jpegWithOrientation(40, 20, 1));

    await service.uploadProductImageVariants(file, "user-1");

    const detail = await sharp(byFilename("detail")).metadata();
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

describe("MediaService — kart/detay yüklemeleri paralel", () => {
  function serviceWith(
    uploadFile: (
      buffer: Buffer,
      options: { filename: string },
    ) => Promise<{ key: string }>,
  ) {
    const storageService = { uploadFile: jest.fn(uploadFile) };
    const service = new MediaService(
      {} as never,
      {} as never,
      storageService as never,
      {} as never,
    );
    return { service, storageService };
  }

  it("iki depo yüklemesi birbirini beklemeden başlar, anahtarlar doğru eşleşir", async () => {
    // Her yükleme, İKİSİ de başlayana dek bekler. Sıralı kod ilkinde takılıp
    // sonsuza dek (zaman aşımı) beklerdi; paralel kod ikisini de başlatır.
    let started = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => (release = resolve));
    const { service, storageService } = serviceWith(async (_buf, options) => {
      started += 1;
      if (started === 2) release();
      await bothStarted;
      return { key: `k/${options.filename}` };
    });

    const result = await service.uploadProductImageVariants(
      fileFrom(await jpegWithOrientation(40, 20, 1)),
      "user-1",
    );

    expect(storageService.uploadFile).toHaveBeenCalledTimes(2);
    expect(result.cardKey).toMatch(/-card\.webp$/);
    expect(result.detailKey).toMatch(/-detail\.webp$/);
    // Aynı `baseId` ikisinde de kullanılır.
    const base = (key: string) => key.replace(/-(card|detail)\.webp$/, "");
    expect(base(result.cardKey)).toBe(base(result.detailKey));
  });

  it("bir yükleme düşerse çağrı reddedilir (kısmi sonuç döndürülmez)", async () => {
    const { service, storageService } = serviceWith(async (_buf, options) => {
      if (options.filename.endsWith("-detail.webp")) {
        throw new Error("s3 down");
      }
      return { key: `k/${options.filename}` };
    });

    await expect(
      service.uploadProductImageVariants(
        fileFrom(await jpegWithOrientation(40, 20, 1)),
        "user-1",
      ),
    ).rejects.toThrow("s3 down");
    // İki yükleme de BAŞLATILMIŞTIR (`Promise.all` diğerini iptal etmez): kart
    // sahipsiz kalabilir, geçici klasör temizliği toplar — ek silme çağrısı
    // yapılmaz.
    expect(storageService.uploadFile).toHaveBeenCalledTimes(2);
  });

  it("kart yüklemesi düşünce de reddeder", async () => {
    const { service } = serviceWith(async (_buf, options) => {
      if (options.filename.endsWith("-card.webp")) throw new Error("card fail");
      return { key: `k/${options.filename}` };
    });

    await expect(
      service.uploadProductImageVariants(
        fileFrom(await jpegWithOrientation(40, 20, 1)),
        "user-1",
      ),
    ).rejects.toThrow("card fail");
  });
});

describe("MediaService.upload — public kök URL'i tanımsız", () => {
  function serviceWithoutPublicBaseUrl() {
    const storageService = {
      uploadFile: jest.fn(),
      getPublicAssetUrl: jest.fn(() => ""),
      hasPublicAssetBaseUrl: jest.fn(() => false),
      getPresignedDownloadUrl: jest.fn(async () => "https://signed.test/k"),
    };
    const service = new MediaService(
      {} as never,
      {} as never,
      storageService as never,
      {} as never,
    );
    return { service, storageService };
  }

  const png = {
    buffer: Buffer.from("x"),
    size: 1,
    mimetype: "image/png",
    originalname: "banner.png",
  } as Express.Multer.File;

  it('public köke yüklemeden ÖNCE 503 verir (sessiz `url: ""` yerine)', async () => {
    const { service, storageService } = serviceWithoutPublicBaseUrl();

    const upload = service.upload(png, { bucket: "products", folder: "ads" });

    await expect(upload).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(upload).rejects.toMatchObject({
      response: { i18nKey: "server.storage.publicUrlNotConfigured" },
    });
    expect(storageService.uploadFile).not.toHaveBeenCalled();
  });

  it("private kök (presigned URL) bu ayara bağlı değildir", async () => {
    const { service, storageService } = serviceWithoutPublicBaseUrl();
    storageService.uploadFile.mockResolvedValue({
      key: "k",
      bucket: "messages",
    });

    await expect(
      service.upload(png, { bucket: "messages" }),
    ).resolves.toMatchObject({ url: "https://signed.test/k" });
  });
});

/**
 * Ölçü, kalite ve depo seçenekleri sharp'ın / depo servisinin kendi tiplerine
 * bağlı sabitlerden gelir (eskiden `sharp: any` yüzünden hiçbiri derleyicide
 * denetlenmiyordu). Burada ÇIKTI sabitlenir: tip düzeltmesi davranışı
 * değiştirmemeli.
 */
describe("MediaService — türev ölçüleri ve depo seçenekleri", () => {
  const IMMUTABLE_WEBP = {
    mimeType: "image/webp",
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
    skipMediaFile: true,
  };

  function recordingService() {
    const calls: Array<{ buffer: Buffer; options: Record<string, unknown> }> =
      [];
    const storageService = {
      uploadFile: jest.fn(
        async (buffer: Buffer, options: Record<string, unknown>) => {
          calls.push({ buffer, options });
          return { key: `k/${String(options.filename)}`, bucket: "x" };
        },
      ),
      getPublicAssetUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
      hasPublicAssetBaseUrl: jest.fn(() => true),
    };
    const service = new MediaService(
      {} as never,
      {} as never,
      storageService as never,
      {} as never,
    );
    const byName = (suffix: string) =>
      calls.find((call) => String(call.options.filename).endsWith(suffix))!;
    return { service, calls, byName };
  }

  it("ürün türevleri: detay en çok 1200 (oran korunur), kart 500×500, değişmez WebP", async () => {
    const { service, calls, byName } = recordingService();

    await service.uploadProductImageVariants(
      fileFrom(await jpegWithOrientation(3000, 1500, 1)),
      "user-1",
    );

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.options).toMatchObject({
        bucket: "products",
        ...IMMUTABLE_WEBP,
      });
    }
    const detail = await sharp(byName("-detail.webp").buffer).metadata();
    expect([detail.width, detail.height, detail.format]).toEqual([
      1200,
      600,
      "webp",
    ]);
    const card = await sharp(byName("-card.webp").buffer).metadata();
    expect([card.width, card.height, card.format]).toEqual([500, 500, "webp"]);
  });

  it("küçük kaynak detayda 1200'e büyütülür (eski davranış korunur)", async () => {
    // `fit: "inside"` withoutEnlargement OLMADAN büyütür: 600×300 → 1200×600.
    // Tip düzeltmesi bunu değiştirmemeli.
    const { service, byName } = recordingService();

    await service.uploadProductImageVariants(
      fileFrom(await jpegWithOrientation(600, 300, 1)),
      "user-1",
    );

    const detail = await sharp(byName("-detail.webp").buffer).metadata();
    expect([detail.width, detail.height]).toEqual([1200, 600]);
  });

  it("koleksiyon kapağı: 1200×600 WebP, aynı değişmez depo seçenekleri", async () => {
    const { service, calls } = recordingService();

    await service.uploadCollectionCover(
      fileFrom(await jpegWithOrientation(900, 900, 1)),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({
      bucket: "collections",
      folder: "covers",
      ...IMMUTABLE_WEBP,
    });
    const cover = await sharp(calls[0].buffer).metadata();
    expect([cover.width, cover.height, cover.format]).toEqual([
      1200,
      600,
      "webp",
    ]);
  });

  it("upload: `withoutEnlargement` sharp'a aynen geçer (küçük görsel büyümez)", async () => {
    const { service, calls } = recordingService();

    await service.upload(fileFrom(await jpegWithOrientation(100, 50, 1)), {
      bucket: "avatars",
      resize: { width: 2400, fit: "inside", withoutEnlargement: true },
    });

    const out = await sharp(calls[0].buffer).metadata();
    expect([out.width, out.height]).toEqual([100, 50]);
  });
});
