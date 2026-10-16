import {
  BadRequestException,
  ValidationPipe,
  type ArgumentMetadata,
} from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validators/global-validation-pipe-options";
import { CreateAdvertisementDto } from "./create-advertisement.dto";
import { UpdateAdvertisementDto } from "./update-advertisement.dto";

/**
 * Reklam gövdeleri GERÇEK global pipe ayarlarıyla dönüştürülür
 * (`whitelist`, `transform`, `enableImplicitConversion`): PartialType'ın
 * başlangıç değeri kopyalaması ve `null` geçirmesi yalnız bu yolda görünür.
 */
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);

const asBody = async <T>(
  metatype: new () => T,
  body: Record<string, unknown>,
): Promise<T> => {
  const metadata: ArgumentMetadata = { type: "body", metatype, data: "" };
  return (await pipe.transform(body, metadata)) as T;
};

const update = (body: Record<string, unknown>) =>
  asBody(UpdateAdvertisementDto, body) as Promise<Record<string, unknown>>;
const create = (body: Record<string, unknown>) =>
  asBody(CreateAdvertisementDto, { title: "Banner", ...body });

describe("UpdateAdvertisementDto", () => {
  it("yalnız gönderilen alanı taşır — varsayılanlar PATCH'e sızmaz", async () => {
    // Eskiden PartialType oluşturma DTO'sunun başlangıç değerlerini kopyalıyor,
    // `{ isActive: false }` pozisyonu header'a, sırayı 0'a sıfırlıyordu.
    const dto = await update({ isActive: false });
    expect(dto).toEqual({ isActive: false });
  });

  it.each([
    "imageUrl",
    "linkUrl",
    "content",
    "altText",
    "width",
    "height",
    "startDate",
    "endDate",
    "discountId",
  ])(
    "temizlenebilir alan %s: null kabul edilir ve null kalır",
    async (field) => {
      const dto = await update({ [field]: null });
      expect(dto[field]).toBeNull();
    },
  );

  it.each(["imageUrl", "linkUrl", "content", "startDate", "width"])(
    "temizlenebilir alan %s: boş dize null'a çevrilir",
    async (field) => {
      const dto = await update({ [field]: "" });
      expect(dto[field]).toBeNull();
    },
  );

  it.each([
    "title",
    "position",
    "platform",
    "popupFrequency",
    "displayOrder",
    "isActive",
  ])("zorunlu alan %s: null 400'dür (Prisma 500'ü yerine)", async (field) => {
    await expect(update({ [field]: null })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("CreateAdvertisementDto — alan kuralları", () => {
  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.com"])(
    "linkUrl %s → 400",
    async (linkUrl) => {
      await expect(create({ linkUrl })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each(["/kategori/x", "https://x.com"])(
    "linkUrl %s kabul",
    async (linkUrl) => {
      await expect(create({ linkUrl })).resolves.toMatchObject({ linkUrl });
    },
  );

  it("imageUrl yalnız https", async () => {
    await expect(
      create({ imageUrl: "http://cdn.example.com/a.png" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      create({ imageUrl: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      create({ imageUrl: "https://cdn.example.com/a.png" }),
    ).resolves.toMatchObject({ imageUrl: "https://cdn.example.com/a.png" });
  });

  it("genişlik/yükseklik tavanı 4000", async () => {
    await expect(create({ width: 4000, height: 4000 })).resolves.toMatchObject({
      width: 4000,
      height: 4000,
    });
    await expect(create({ width: 4001 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(create({ height: 4001 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("başlık uzunluk tavanı", async () => {
    await expect(create({ title: "x".repeat(201) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("topbar geçerli yuva; kaldırılan sidebar 400", async () => {
    await expect(create({ position: "topbar" })).resolves.toMatchObject({
      position: "topbar",
    });
    await expect(create({ position: "sidebar" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("platform: web / app / all kabul; bilinmeyen 400", async () => {
    for (const platform of ["web", "app", "all"]) {
      await expect(create({ platform })).resolves.toMatchObject({ platform });
    }
    await expect(create({ platform: "desktop" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("popupFrequency: every_visit / until_dismissed kabul; bilinmeyen 400", async () => {
    for (const popupFrequency of ["every_visit", "until_dismissed"]) {
      await expect(create({ popupFrequency })).resolves.toMatchObject({
        popupFrequency,
      });
    }
    await expect(create({ popupFrequency: "daily" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("eski deviceType gövdeden düşer (whitelist), hata vermez", async () => {
    await expect(create({ deviceType: "mobile" })).resolves.not.toHaveProperty(
      "deviceType",
    );
  });

  it("popupVersion istemciden yazılamaz (whitelist düşürür)", async () => {
    await expect(update({ popupVersion: 99 })).resolves.toEqual({});
  });

  describe("hotspots", () => {
    const spot = (over: Record<string, unknown> = {}) => ({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
      label: "Sol",
      linkUrl: "/sol",
      ...over,
    });

    it("geçerli alan listesi nesne olarak dönüşür", async () => {
      const id = "11111111-1111-4111-8111-111111111111";
      const dto = await create({
        imageUrl: "https://cdn.example.com/a.png",
        hotspots: [spot({ id }), spot({ x: 0.5, linkUrl: "https://x.com" })],
      });
      expect(dto.hotspots).toHaveLength(2);
      expect(dto.hotspots?.[0]).toMatchObject({ id, x: 0, label: "Sol" });
    });

    it.each([
      ["javascript: bağlantı", { linkUrl: "javascript:alert(1)" }],
      ["boş bağlantı", { linkUrl: "" }],
      ["protokol-göreli bağlantı", { linkUrl: "//evil.com" }],
      ["80 karakteri aşan ad", { label: "x".repeat(81) }],
      ["sayı olmayan x", { x: "sol" }],
      ["sonsuz en", { width: Infinity }],
      ["uuid olmayan id", { id: "abc" }],
    ])("%s → 400", async (_d, over) => {
      await expect(create({ hotspots: [spot(over)] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("dizi değilse 400", async () => {
      await expect(create({ hotspots: spot() })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("güncellemede null 400 (temizlemek için [])", async () => {
      await expect(update({ hotspots: null })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(update({ hotspots: [] })).resolves.toEqual({ hotspots: [] });
    });

    it("güncellemede gönderilmezse alan taşınmaz (dokunma)", async () => {
      await expect(update({ title: "X" })).resolves.not.toHaveProperty(
        "hotspots",
      );
    });
  });

  it("ofsetli ISO tarihleri kabul eder", async () => {
    await expect(
      create({
        startDate: "2026-11-01T00:00:00.000+03:00",
        endDate: "2026-11-30T23:59:59.999+03:00",
      }),
    ).resolves.toMatchObject({
      startDate: "2026-11-01T00:00:00.000+03:00",
      endDate: "2026-11-30T23:59:59.999+03:00",
    });
  });
});
