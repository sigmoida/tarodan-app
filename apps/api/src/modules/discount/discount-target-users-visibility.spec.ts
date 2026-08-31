import { DiscountCrudService } from "./discount-crud.service";

/**
 * Hedeflenen kişilerin KİMLİK BİLGİSİ yalnız yönetim yolunda döner.
 *
 * `findAll`/`findOne` iki çağıranı birden besliyor: yönetim ekranı
 * (`isAdmin: true`) ve satıcının kendi indirimleri (`GET /discounts`,
 * `isAdmin: false`). Yönetim formu seçili kitleyi ad/e-posta ile göstermek
 * zorunda; ama aynı alanlar satıcıya da dönseydi uç bir kimlik→e-posta
 * sorgusuna dönerdi: satıcı kendi kampanyasına istediği kullanıcı kimliğini
 * hedef olarak yazabiliyor (sahiplik/varlık denetimi yok) ve alıcı
 * kimliklerini siparişlerinden görebiliyor.
 *
 * Bu yüzden kitle ilişkileri include'a KOŞULLU giriyor. Test, koşulun
 * kaybolmasını yakalar.
 */
describe("DiscountCrudService — hedef kitle görünürlüğü", () => {
  const build = () => {
    const prisma = {
      discount: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue({
          id: "d-1",
          sellerId: "seller-1",
          startDate: new Date(),
          endDate: new Date(),
          isActive: true,
          usedCount: 0,
        }),
      },
    };
    const service = new DiscountCrudService(
      prisma as never,
      {} as never,
      {} as never,
    );
    return { prisma, service };
  };

  const includeOfFindMany = (prisma: any) =>
    prisma.discount.findMany.mock.calls[0][0].include;
  const includeOfFindUnique = (prisma: any) =>
    prisma.discount.findUnique.mock.calls[0][0].include;

  it("liste: yönetici kitleyi ad/e-postasıyla görür", async () => {
    const { prisma, service } = build();

    await service.findAll({} as never, "admin-1", true);

    const include = includeOfFindMany(prisma);
    expect(include.targetUsers).toBeDefined();
    expect(include.targetUsers.select.user.select).toMatchObject({
      displayName: true,
      email: true,
    });
    expect(include.targetTiers).toBeDefined();
  });

  it("liste: SATICI hedef kitle satırlarını hiç görmez", async () => {
    const { prisma, service } = build();

    await service.findAll({} as never, "seller-1", false);

    const include = includeOfFindMany(prisma);
    expect(include.targetUsers).toBeUndefined();
    expect(include.targetTiers).toBeUndefined();
  });

  it("detay: yönetici kitleyi görür, satıcı görmez", async () => {
    const admin = build();
    await admin.service.findOne("d-1", "admin-1", true);
    expect(includeOfFindUnique(admin.prisma).targetUsers).toBeDefined();

    const seller = build();
    await seller.service.findOne("d-1", "seller-1", false);
    expect(includeOfFindUnique(seller.prisma).targetUsers).toBeUndefined();
  });
});
