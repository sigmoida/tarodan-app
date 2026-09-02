import { BadRequestException } from "@nestjs/common";
import { ProductCommonService } from "./product-common.service";
import { localizedPayloadOf } from "../i18n";

/**
 * `attributes[]` (özel grup slug'ları) çözümlemesinin kuralları: genel özel
 * grupta tek seçim, zorunlu genel özel grup eksikse 400, sabit üçlü ve gizli
 * gruplar bu yoldan bağlanamaz.
 */
describe("ProductCommonService özel grup kuralları", () => {
  const rarity = {
    id: "g-rarity",
    slug: "nadirlik-bulunabilirlik",
    name: "Nadirlik/Bulunabilirlik",
    manufacturerSlug: null,
  };
  const hwSegment = {
    id: "g-hw",
    slug: "hw-segment",
    name: "Hot Wheels Segment",
    manufacturerSlug: "hot-wheels",
  };
  const catalog = [
    { id: "attr-nadir", slug: "nadir", group: rarity },
    { id: "attr-yaygin", slug: "yaygin", group: rarity },
    { id: "attr-mainline", slug: "mainline", group: hwSegment },
    { id: "attr-premium", slug: "premium", group: hwSegment },
  ];

  function setup(requiredGroups: Array<{ slug: string; name: string }> = []) {
    const prisma = {
      attribute: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.group?.slug === "color") return Promise.resolve([]);
          const requested = (where.OR ?? []).map((clause: any) =>
            clause.slug.equals.toLowerCase(),
          );
          return Promise.resolve(
            catalog.filter((row) => requested.includes(row.slug)),
          );
        }),
      },
      attributeGroup: {
        findMany: jest.fn().mockResolvedValue(requiredGroups),
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

  it("özel slug'ları sabit üçlü ve gizli gruplar dışında arar", async () => {
    const { service, prisma } = setup();

    await service.resolveProductAttributes({ attributeSlugs: ["nadir"] });

    const where = prisma.attribute.findMany.mock.calls[0][0].where;
    expect(where.group.slug.notIn).toEqual(
      expect.arrayContaining(["scale", "material", "color", "vehicle_type"]),
    );
  });

  it("genel özel grupta iki farklı değer 400 döner", async () => {
    const { service } = setup();

    const attempt = service.resolveProductAttributes({
      attributeSlugs: ["nadir", "yaygin"],
    });

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await attempt.catch((error) => {
      expect(localizedPayloadOf(error)?.i18nKey).toBe(
        "server.product.attributeGroupSingleSelect",
      );
    });
  });

  it("aynı slug iki kez gelirse tek bağ, hata yok", async () => {
    const { service } = setup();

    const resolved = await service.resolveProductAttributes({
      attributeSlugs: ["nadir", "NADIR"],
    });

    expect(resolved.ids).toEqual(["attr-nadir"]);
  });

  it("üreticiye bağlı grup çoklu seçime izin verir", async () => {
    const { service } = setup();

    const resolved = await service.resolveProductAttributes({
      attributeSlugs: ["mainline", "premium"],
    });

    expect(resolved.ids).toEqual(["attr-mainline", "attr-premium"]);
  });

  describe("zorunlu genel özel gruplar", () => {
    const required = [{ slug: rarity.slug, name: rarity.name }];

    it("seçim yokken zorunlu grup 400 döner (istek boş olsa bile)", async () => {
      const { service, prisma } = setup(required);

      const attempt = service.resolveProductAttributes(
        {},
        { enforceRequiredGroups: true },
      );

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await attempt.catch((error) => {
        expect(localizedPayloadOf(error)).toEqual({
          i18nKey: "server.product.requiredAttributeGroups",
          i18nParams: { groups: "Nadirlik/Bulunabilirlik" },
        });
      });
      // Sabit üçlü ve gizli gruplar zorunlu sayılmaz (canlıda material/color
      // isRequired=true), değeri olmayan zorunlu grup da sayılmaz.
      const where = prisma.attributeGroup.findMany.mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({
          isActive: true,
          isRequired: true,
          manufacturerSlug: null,
          attributes: { some: { isActive: true } },
        }),
      );
      expect(where.slug.notIn).toEqual(
        expect.arrayContaining(["scale", "material", "color", "vehicle_type"]),
      );
    });

    it("zorunlu grup seçimde varsa geçer", async () => {
      const { service } = setup(required);

      const resolved = await service.resolveProductAttributes(
        { attributeSlugs: ["nadir"] },
        { enforceRequiredGroups: true },
      );

      expect(resolved.ids).toEqual(["attr-nadir"]);
    });

    it("bayrak kapalıysa zorunlu grup sorgulanmaz", async () => {
      const { service, prisma } = setup(required);

      await service.resolveProductAttributes({ attributeSlugs: ["mainline"] });

      expect(prisma.attributeGroup.findMany).not.toHaveBeenCalled();
    });

    it("zorunluluk hatası bilinmeyen-slug hatasından önce gelir", async () => {
      const { service } = setup(required);

      await expect(
        service.resolveProductAttributes(
          { attributeSlugs: ["yok-boyle-slug"] },
          { enforceRequiredGroups: true, rejectUnknown: true },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
