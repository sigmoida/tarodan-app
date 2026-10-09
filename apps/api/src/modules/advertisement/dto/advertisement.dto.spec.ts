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
  ])("temizlenebilir alan %s: null kabul edilir ve null kalır", async (field) => {
    const dto = await update({ [field]: null });
    expect(dto[field]).toBeNull();
  });

  it.each(["imageUrl", "linkUrl", "content", "startDate", "width"])(
    "temizlenebilir alan %s: boş dize null'a çevrilir",
    async (field) => {
      const dto = await update({ [field]: "" });
      expect(dto[field]).toBeNull();
    },
  );

  it.each(["title", "position", "deviceType", "displayOrder", "isActive"])(
    "zorunlu alan %s: null 400'dür (Prisma 500'ü yerine)",
    async (field) => {
      await expect(update({ [field]: null })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});

describe("CreateAdvertisementDto — alan kuralları", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.com",
  ])("linkUrl %s → 400", async (linkUrl) => {
    await expect(create({ linkUrl })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

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
    await expect(create({ width: 4000, height: 4000 })).resolves.toMatchObject(
      { width: 4000, height: 4000 },
    );
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
