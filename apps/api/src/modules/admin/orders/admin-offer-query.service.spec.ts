import { OfferStatus } from "@prisma/client";
import { AdminOfferQueryService } from "./admin-offer-query.service";

/**
 * Admin teklif listesi/detayı: sanal `expired` kuralı (süresi geçmiş pending
 * cron çalışana kadar DB'de pending kalır), taraf filtresi, arama ve detaydaki
 * zincir / kardeş teklif / rakip kabul ayrımı.
 */
describe("AdminOfferQueryService", () => {
  const now = Date.now();
  const party = (id: string) => ({ id, displayName: id, email: `${id}@x` });
  const product = {
    id: "p1",
    title: "Ürün",
    price: 1000,
    status: "active",
    quantity: 1,
    reservedQuantity: 0,
    sellerId: "s1",
    images: [],
  };
  const row = (over: Record<string, unknown>) => ({
    id: "of1",
    productId: "p1",
    buyerId: "b1",
    sellerId: "s1",
    amount: 800,
    status: OfferStatus.pending,
    buyerMustAccept: false,
    message: null,
    cancelReason: null,
    version: 1,
    expiresAt: new Date(now + 3600_000),
    createdAt: new Date(now - 3600_000),
    updatedAt: new Date(now - 3600_000),
    buyer: party("b1"),
    seller: party("s1"),
    product,
    order: null,
    ...over,
  });

  const makeService = (prismaOver: Record<string, any> = {}) => {
    const prisma: any = {
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      order: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      ...prismaOver,
    };
    return { service: new AdminOfferQueryService(prisma), prisma };
  };

  it("effectiveStatus: süresi geçmiş pending → expired, diğerleri aynen", () => {
    expect(
      AdminOfferQueryService.effectiveStatus({
        status: OfferStatus.pending,
        expiresAt: new Date(now - 1),
      }),
    ).toBe(OfferStatus.expired);
    expect(
      AdminOfferQueryService.effectiveStatus({
        status: OfferStatus.accepted,
        expiresAt: new Date(now - 1),
      }),
    ).toBe(OfferStatus.accepted);
  });

  it("status=pending yalnız süresi dolmamışları, status=expired süresi geçmiş pending'leri de kapsar", async () => {
    const { service, prisma } = makeService();
    await service.getOffers({ status: OfferStatus.pending } as any);
    const wherePending = prisma.offer.findMany.mock.calls[0][0].where;
    expect(wherePending.AND[0]).toEqual({
      status: OfferStatus.pending,
      expiresAt: { gte: expect.any(Date) },
    });

    await service.getOffers({ status: OfferStatus.expired } as any);
    const whereExpired = prisma.offer.findMany.mock.calls[1][0].where;
    expect(whereExpired.AND[0].OR).toEqual([
      { status: OfferStatus.expired },
      { status: OfferStatus.pending, expiresAt: { lt: expect.any(Date) } },
    ]);
  });

  it("userId + userRole taraf filtresi; rol yoksa iki taraf", async () => {
    const { service, prisma } = makeService();
    await service.getOffers({ userId: "u1", userRole: "seller" } as any);
    expect(prisma.offer.findMany.mock.calls[0][0].where.AND).toEqual([
      { sellerId: "u1" },
    ]);
    await service.getOffers({ userId: "u1" } as any);
    expect(prisma.offer.findMany.mock.calls[1][0].where.AND).toEqual([
      { OR: [{ buyerId: "u1" }, { sellerId: "u1" }] },
    ]);
  });

  it("arama: taraf adı/e-posta, ürün başlığı, sipariş no ve sayısal tutar", async () => {
    const { service, prisma } = makeService();
    await service.getOffers({ search: "750" } as any);
    const or = prisma.offer.findMany.mock.calls[0][0].where.AND[0].OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { product: { title: { contains: "750", mode: "insensitive" } } },
        { order: { orderNumber: { contains: "750", mode: "insensitive" } } },
        { amount: 750 },
      ]),
    );
  });

  it("liste satırı: tutar sayı, görünen durum expired, bağlı sipariş özeti", async () => {
    const { service } = makeService({
      offer: {
        findMany: jest.fn().mockResolvedValue([
          row({
            expiresAt: new Date(now - 1),
            order: {
              id: "o1",
              orderNumber: "ORD-1",
              status: "pending_payment",
              totalAmount: 830,
              cancelReason: null,
              cancellationType: null,
              createdAt: new Date(),
              payment: null,
            },
          }),
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const res = await service.getOffers({} as any);
    expect(res.data[0]).toEqual(
      expect.objectContaining({
        amount: 800,
        status: OfferStatus.expired,
        rawStatus: OfferStatus.pending,
        product: expect.objectContaining({ listPrice: 1000 }),
        order: expect.objectContaining({
          orderNumber: "ORD-1",
          totalAmount: 830,
          paymentStatus: null,
        }),
      }),
    );
  });

  it("detay: zincir aynı (ürün, alıcı, satıcı) satırları createdAt sırasıyla; diğerleri kardeş; rakip sayaçları", async () => {
    const current = row({ id: "of2", createdAt: new Date(now - 1000) });
    const earlier = row({
      id: "of1",
      status: OfferStatus.rejected,
      buyerMustAccept: true, // satıcı karşı teklifi
      createdAt: new Date(now - 5000),
    });
    const other = row({
      id: "of3",
      buyerId: "b2",
      buyer: party("b2"),
      status: OfferStatus.accepted,
      createdAt: new Date(now - 2000),
    });
    const { service, prisma } = makeService({
      offer: {
        findUnique: jest.fn().mockResolvedValue(current),
        findMany: jest.fn().mockResolvedValue([earlier, other, current]),
      },
      order: {
        count: jest.fn().mockResolvedValue(2),
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: "o9",
            orderNumber: "ORD-9",
            status: "paid",
          }),
      },
    });

    const d = await service.getOfferById("of2");

    expect(d.chain.map((c) => c.id)).toEqual(["of1", "of2"]);
    expect(d.chain[0].actor).toBe("seller");
    expect(d.chain[1]).toEqual(
      expect.objectContaining({ actor: "buyer", isCurrent: true }),
    );
    expect(d.siblings.map((s) => s.id)).toEqual(["of3"]);
    expect(d.competing).toEqual({
      acceptedOffers: 1,
      pendingPaymentOrders: 2,
      soldOrder: { id: "o9", orderNumber: "ORD-9", status: "paid" },
    });
    expect(prisma.offer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: "p1" } }),
    );
  });

  it("detay: olmayan teklif 404", async () => {
    const { service } = makeService({
      offer: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
      },
    });
    await expect(service.getOfferById("nope")).rejects.toMatchObject({
      response: { i18nKey: "server.offer.offerNotFound" },
    });
  });
});
