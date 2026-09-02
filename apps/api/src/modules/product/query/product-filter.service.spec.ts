import { ProductFilterService } from "./product-filter.service";

/**
 * Filtre metadatası UYDURMAZ.
 *
 * Bu servis bir dönem, `material` grubunda hiç aktif değer kalmadığında
 * dört malzemeyi (diecast/resin/composite/plastic) sunucu tarafında sabit
 * olarak ekliyordu. Sonucu şuydu: API katalogda KARŞILIĞI OLMAYAN slug'lar
 * ilan ediyor, ilan formu onları seçtiriyor, kayıt yolu
 * (`product-common.resolveProductAttributes`) slug'ı bulamayıp değeri sessizce
 * düşürüyor ve filtre o malzemeyi hiç listelemediği için ürün oradan
 * bulunamıyordu. Aynı hata ölçek için daha önce fark edilip temizlenmişti;
 * malzemede kalmıştı.
 *
 * Boş liste doğru cevaptır — yönetici grubu doldurur.
 */
describe("ProductFilterService.getFilters", () => {
  const build = () => {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      manufacturer: { findMany: jest.fn().mockResolvedValue([]) },
      carModel: { findMany: jest.fn().mockResolvedValue([]) },
      attribute: { findMany: jest.fn().mockResolvedValue([]) },
      attributeGroup: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new ProductFilterService(prisma as any) };
  };

  it("malzeme grubu boşken BOŞ dizi döner — uydurma seçenek yok", async () => {
    const { service } = build();

    const filters = await service.getFilters();

    expect(filters.materials).toEqual([]);
  });

  it("ölçek grubu boşken de boş döner (aynı kural)", async () => {
    const { service } = build();

    const filters = await service.getFilters();

    expect(filters.scales).toEqual([]);
  });

  it("yalnız AKTİF değerleri ve AKTİF grupları okur", async () => {
    const { prisma, service } = build();

    await service.getFilters();

    for (const call of prisma.attribute.findMany.mock.calls) {
      expect(call[0].where).toMatchObject({
        isActive: true,
        group: expect.objectContaining({ isActive: true }),
      });
    }
  });

  it("katalogda ne varsa onu döner (etiket displayValue'dan)", async () => {
    const { prisma, service } = build();
    prisma.attribute.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.group.slug === "material"
          ? [{ slug: "ahsap", value: "Ahsap", displayValue: "Ahşap" }]
          : [],
      ),
    );

    const filters = await service.getFilters();

    expect(filters.materials).toEqual([{ slug: "ahsap", label: "Ahşap" }]);
  });
});

/**
 * Özel gruplar: admin'in açtığı üreticisiz gruplar (Nadirlik gibi) üretici
 * seçilmeden de döner; üreticiye bağlı olanlar yalnız `manufacturer` ile
 * eklenir. Bir dönem yalnız üreticiye bağlı gruplar dönüyordu ve admin'den
 * açılan hiçbir grup ilan formuna/filtreye ulaşamıyordu.
 */
describe("ProductFilterService özel gruplar", () => {
  const rarity = {
    slug: "nadirlik-bulunabilirlik",
    name: "Nadirlik/Bulunabilirlik",
    description: null,
    isRequired: true,
    manufacturerSlug: null,
    attributes: [
      { slug: "nadir", value: "Nadir", displayValue: null, color: null },
    ],
  };
  const hwSegment = {
    slug: "hw-segment",
    name: "Hot Wheels Segment",
    description: null,
    isRequired: false,
    manufacturerSlug: "hot-wheels",
    attributes: [
      { slug: "mainline", value: "Mainline", displayValue: null, color: null },
    ],
  };

  const build = () => {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      manufacturer: { findMany: jest.fn().mockResolvedValue([]) },
      carModel: { findMany: jest.fn().mockResolvedValue([]) },
      attribute: { findMany: jest.fn().mockResolvedValue([]) },
      attributeGroup: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          const scoped = (where.OR ?? []).some(
            (clause: any) => clause.manufacturerSlug === "hot-wheels",
          );
          return Promise.resolve(scoped ? [rarity, hwSegment] : [rarity]);
        }),
      },
    };
    return { prisma, service: new ProductFilterService(prisma as any) };
  };

  it("getFilters üreticisiz de genel özel grupları döner, seçim kipiyle", async () => {
    const { service } = build();

    const filters = await service.getFilters();

    expect(filters.customAttributes).toEqual([
      {
        slug: "nadirlik-bulunabilirlik",
        name: "Nadirlik/Bulunabilirlik",
        isRequired: true,
        manufacturerSlug: null,
        selectionMode: "single",
        attributes: [{ slug: "nadir", label: "Nadir", color: null }],
      },
    ]);
  });

  it("getFilters sabit üçlüyü ve gizli grubu özel gruplardan dışlar", async () => {
    const { prisma, service } = build();

    await service.getFilters("hot-wheels");

    const where = prisma.attributeGroup.findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.slug.notIn).toEqual(
      expect.arrayContaining(["scale", "material", "color", "vehicle_type"]),
    );
    expect(where.OR).toEqual([
      { manufacturerSlug: null },
      { manufacturerSlug: "hot-wheels" },
    ]);
  });

  it("üretici verilince üreticiye bağlı grup çoklu kipte eklenir", async () => {
    const { service } = build();

    const filters = await service.getFilters("hot-wheels");

    expect(
      filters.customAttributes.map((g) => [g.slug, g.selectionMode]),
    ).toEqual([
      ["nadirlik-bulunabilirlik", "single"],
      ["hw-segment", "multi"],
    ]);
  });

  it("attribute-groups ucu yalnız gizli grubu dışlar (sabit üçlü formun alanları)", async () => {
    const { prisma, service } = build();

    const groups = await service.getAttributeGroupsForManufacturer();

    const where = prisma.attributeGroup.findMany.mock.calls[0][0].where;
    expect(where.slug.notIn).toEqual(["vehicle_type"]);
    expect(groups[0]).toEqual(
      expect.objectContaining({
        slug: "nadirlik-bulunabilirlik",
        isRequired: true,
        selectionMode: "single",
        description: null,
      }),
    );
  });
});
