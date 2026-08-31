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
