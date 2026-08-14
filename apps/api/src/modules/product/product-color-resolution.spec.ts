import { BadRequestException } from "@nestjs/common";
import { ProductCommonService } from "./product-common.service";

/**
 * Renk seçiminin ürüne bağlanması ve denormalize `products.color` kolonu için
 * gereken etiketlerin dönmesi.
 *
 * Ölçek/malzeme bilinmeyen değerde sessizce düşürülür (eski davranış, toplu
 * içe aktarma buna dayanıyor); RENK düşürülmez — satıcı seçtiği rengin
 * kaybolduğunu ancak ilan yayımlandıktan sonra fark ederdi.
 */
describe("ProductCommonService renk çözümlemesi", () => {
  const attributeRows = [
    {
      id: "attr-red",
      slug: "red",
      value: "Kırmızı",
      displayValue: "Kırmızı",
    },
    {
      id: "attr-black",
      slug: "black",
      value: "Siyah",
      displayValue: null,
    },
  ];

  function setup() {
    const prisma = {
      attribute: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.group?.slug !== "color") return Promise.resolve([]);
          const requested = (where.OR ?? []).map((clause: any) =>
            clause.slug.equals.toLowerCase(),
          );
          return Promise.resolve(
            attributeRows.filter((row) => requested.includes(row.slug)),
          );
        }),
      },
      productAttribute: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
    const service = new ProductCommonService(
      prisma as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  }

  it("slug'ları id'ye çevirir ve görünen adları döndürür", async () => {
    const { service } = setup();

    const resolved = await service.resolveProductAttributes({
      colors: ["red", "BLACK"],
    });

    expect(resolved.ids).toEqual(["attr-red", "attr-black"]);
    // displayValue boşsa value'ya düşer — kolon boş metin taşımasın.
    expect(resolved.colorLabels).toEqual(["Kırmızı", "Siyah"]);
  });

  it("aynı renk iki kez gönderilse tek kez bağlanır", async () => {
    const { service } = setup();

    const resolved = await service.resolveProductAttributes({
      colors: ["red", "red"],
    });

    expect(resolved.ids).toEqual(["attr-red"]);
    expect(resolved.colorLabels).toEqual(["Kırmızı"]);
  });

  it("katalogda olmayan rengi sessizce yutmaz", async () => {
    const { service } = setup();

    await expect(
      service.resolveProductAttributes({ colors: ["red", "fuchsia"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("çözülen renkleri ürüne bağlar", async () => {
    const { service, prisma } = setup();

    await service.linkProductAttributes("product-1", { colors: ["red"] });

    expect(prisma.productAttribute.upsert).toHaveBeenCalledWith({
      where: {
        productId_attributeId: {
          productId: "product-1",
          attributeId: "attr-red",
        },
      },
      create: { productId: "product-1", attributeId: "attr-red" },
      update: {},
    });
  });
});
