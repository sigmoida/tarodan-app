import { AdminCatalogService } from "./admin-catalog.service";

/**
 * Öznitelik kaldırma kapıları.
 *
 * Silme zaten kullanımdaki değeri koruyordu ama PASİFE ALMA hiçbir kontrolden
 * geçmiyordu — oysa web'de sonucu aynı: değer filtreden ve formdan düşer, onu
 * taşıyan ürünler filtreyle bulunamaz olur, ilan yeniden kaydedilince değer
 * sessizce silinir. İkinci kapı da boşalmaya karşı: ölçek/malzeme/renk ilan
 * formunda zorunludur, son aktif değerleri giderse satıcı hiç ilan veremez.
 * (Sistem eskiden bu durumda seçenek uyduruyordu; bu kapılar onun yerine geçti.)
 */
function build() {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });
  const prisma = {
    category: model(),
    brand: model(),
    manufacturer: model(),
    carModel: model(),
    attributeGroup: model(),
    attribute: model(),
    productAttribute: model(),
    commissionRuleSet: model(),
  };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(0),
  };
  const audit = { createAuditLog: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminCatalogService(
    prisma as any,
    cache as any,
    audit as any,
    {} as any,
  );
  return { prisma, service, audit };
}

/** Kullanımda olmayan, korunan grupta kardeşi bulunan aktif bir değer. */
const attributeRow = (over: Record<string, unknown> = {}) => ({
  id: "attr-1",
  groupId: "grp-1",
  value: "Diecast",
  slug: "diecast",
  isActive: true,
  _count: { productAttributes: 0 },
  ...over,
});

describe("AdminCatalogService — öznitelik değeri kapıları", () => {
  let prisma: any;
  let service: AdminCatalogService;

  beforeEach(() => {
    ({ prisma, service } = build());
  });

  it("kullanımdaki değer PASİFE ALINAMAZ (silme kuralıyla simetrik)", async () => {
    prisma.attribute.findUnique.mockResolvedValue(
      attributeRow({ _count: { productAttributes: 12 } }),
    );

    await expect(
      service.updateAttribute("admin-1", "attr-1", { isActive: false }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.catalog.attributeDeactivateInUse" },
    });
    expect(prisma.attribute.update).not.toHaveBeenCalled();
  });

  it("korunan grubun SON AKTİF değeri pasife alınamaz", async () => {
    prisma.attribute.findUnique.mockResolvedValue(attributeRow());
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Malzeme",
      slug: "material",
      isRequired: false,
    });
    prisma.attribute.count.mockResolvedValue(0); // başka aktif kardeş yok

    await expect(
      service.updateAttribute("admin-1", "attr-1", { isActive: false }),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.admin.catalog.attributeLastInRequiredGroup",
      },
    });
    expect(prisma.attribute.update).not.toHaveBeenCalled();
  });

  it("korunan grubun son aktif değeri SİLİNEMEZ de", async () => {
    prisma.attribute.findUnique.mockResolvedValue(attributeRow());
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Ölçek",
      slug: "scale",
      isRequired: false,
    });
    prisma.attribute.count.mockResolvedValue(0);

    await expect(
      service.deleteAttribute("admin-1", "attr-1"),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.admin.catalog.attributeLastInRequiredGroup",
      },
    });
    expect(prisma.attribute.delete).not.toHaveBeenCalled();
  });

  it("aktif kardeşi varsa korunan grupta da pasife alınabilir", async () => {
    prisma.attribute.findUnique.mockResolvedValue(attributeRow());
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Malzeme",
      slug: "material",
      isRequired: false,
    });
    prisma.attribute.count.mockResolvedValue(3);
    prisma.attribute.update.mockResolvedValue({
      ...attributeRow({ isActive: false }),
      group: { id: "grp-1", name: "Malzeme" },
    });

    await service.updateAttribute("admin-1", "attr-1", { isActive: false });

    expect(prisma.attribute.update).toHaveBeenCalled();
  });

  it("korunmayan grubun son değeri serbestçe kaldırılabilir", async () => {
    prisma.attribute.findUnique.mockResolvedValue(attributeRow());
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Seri",
      slug: "hw-series",
      isRequired: false,
    });
    prisma.attribute.count.mockResolvedValue(0);

    await service.deleteAttribute("admin-1", "attr-1");

    expect(prisma.attribute.delete).toHaveBeenCalledWith({
      where: { id: "attr-1" },
    });
  });

  it("isRequired işaretli grup da korunur (kod sabitinde olmasa bile)", async () => {
    prisma.attribute.findUnique.mockResolvedValue(attributeRow());
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Hot Wheels Serisi",
      slug: "hw-series",
      isRequired: true,
    });
    prisma.attribute.count.mockResolvedValue(0);

    await expect(
      service.deleteAttribute("admin-1", "attr-1"),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.admin.catalog.attributeLastInRequiredGroup",
      },
    });
  });

  it("PASİF bir değerin kaldırılması grubu boşaltmaz — engellenmez", async () => {
    prisma.attribute.findUnique.mockResolvedValue(
      attributeRow({ isActive: false }),
    );
    prisma.attributeGroup.findUnique.mockResolvedValue({
      name: "Malzeme",
      slug: "material",
      isRequired: false,
    });

    await service.deleteAttribute("admin-1", "attr-1");

    expect(prisma.attribute.delete).toHaveBeenCalled();
    // Aktif kardeş sayımına hiç gerek yok: pasif değer zaten sayıya girmiyor.
    expect(prisma.attribute.count).not.toHaveBeenCalled();
  });
});

describe("AdminCatalogService — öznitelik grubu kapıları", () => {
  let prisma: any;
  let service: AdminCatalogService;

  beforeEach(() => {
    ({ prisma, service } = build());
  });

  it("korunan grup PASİFE ALINAMAZ", async () => {
    prisma.attributeGroup.findUnique.mockResolvedValue({
      id: "grp-1",
      name: "Malzeme",
      slug: "material",
      isRequired: false,
      isActive: true,
    });

    await expect(
      service.updateAttributeGroup("admin-1", "grp-1", { isActive: false }),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.admin.catalog.attributeGroupProtected" },
    });
    expect(prisma.attributeGroup.update).not.toHaveBeenCalled();
  });

  it("korunmayan grup, değerleri kullanımdaysa pasife alınamaz", async () => {
    prisma.attributeGroup.findUnique.mockResolvedValue({
      id: "grp-1",
      name: "Seri",
      slug: "hw-series",
      isRequired: false,
      isActive: true,
    });
    prisma.productAttribute.count.mockResolvedValue(7);

    await expect(
      service.updateAttributeGroup("admin-1", "grp-1", { isActive: false }),
    ).rejects.toMatchObject({
      response: {
        i18nKey: "server.admin.catalog.attributeGroupDeactivateInUse",
      },
    });
    expect(prisma.attributeGroup.update).not.toHaveBeenCalled();
  });

  it("korunan grubun ADI değişse bile SLUG'ı sabit kalır", async () => {
    // Slug kod sözleşmesi: filtre üretimi, where kurulumu ve ürün yazma yolu
    // `material` ile eşleşir. Yeniden adlandırma slug'ı değiştirseydi grup
    // adı değiştiği anda tüm hat sessizce eşleşmeyi bırakırdı.
    prisma.attributeGroup.findUnique.mockResolvedValue({
      id: "grp-1",
      name: "Malzeme",
      slug: "material",
      isRequired: false,
      isActive: true,
    });
    prisma.attributeGroup.update.mockResolvedValue({
      id: "grp-1",
      _count: { attributes: 4 },
    });

    await service.updateAttributeGroup("admin-1", "grp-1", {
      name: "Materyal",
    });

    const data = prisma.attributeGroup.update.mock.calls[0][0].data;
    expect(data.name).toBe("Materyal");
    expect(data.slug).toBeUndefined();
  });

  it("korunmayan grup yeniden adlandırılınca slug'ı güncellenir", async () => {
    prisma.attributeGroup.findUnique.mockResolvedValue({
      id: "grp-2",
      name: "Seri",
      slug: "seri",
      isRequired: false,
      isActive: true,
    });
    prisma.attributeGroup.update.mockResolvedValue({
      id: "grp-2",
      _count: { attributes: 1 },
    });

    await service.updateAttributeGroup("admin-1", "grp-2", {
      name: "Koleksiyon Serisi",
    });

    expect(prisma.attributeGroup.update.mock.calls[0][0].data.slug).toBe(
      "koleksiyon-serisi",
    );
  });
});
