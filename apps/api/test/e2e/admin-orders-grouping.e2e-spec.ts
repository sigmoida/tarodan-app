import { Prisma, OrderStatus } from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { AdminOrderService } from "../../src/modules/admin/admin-order.service";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";

/**
 * Admin sipariş listesi GRUP (CheckoutGroup) bazında sayfalanır: bir sepet asla
 * sayfa sınırına bölünmez — sayfadaki her grubun TÜM siparişleri döner ve
 * meta.total grup sayısıdır (order sayısı değil). Tekli sipariş = 1'lik grup. [P1]
 *
 * Hafif harness (app/ES bootstrap yok): gerçek DB + doğrudan kurulan servis.
 */
describe("Admin orders — group-based pagination (cati)", () => {
  let prisma: PrismaService;
  let admin: AdminOrderService;

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    admin = new AdminOrderService(
      prisma,
      { createAuditLog: async () => {} } as any, // audit
      undefined as any, // storageService (@Optional)
    );
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  async function makeGroup(opts: {
    orderCount: number;
    createdAt: Date;
  }): Promise<{ groupId: string }> {
    const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const buyer = await prisma.user.create({
      data: { email: `b-${uniq}@t.local`, passwordHash: "x", displayName: "B" },
    });
    const seller = await prisma.user.create({
      data: {
        email: `s-${uniq}@t.local`,
        passwordHash: "x",
        displayName: "S",
        isSeller: true,
      },
    });
    const category = await prisma.category.findFirst();
    const group = await prisma.checkoutGroup.create({
      data: {
        groupNumber: `GRP-${uniq}`,
        buyerId: buyer.id,
        totalAmount: new Prisma.Decimal(100 * opts.orderCount),
        createdAt: opts.createdAt,
      },
    });
    const pkg = await prisma.orderPackage.create({
      data: {
        checkoutGroupId: group.id,
        sellerId: seller.id,
        buyerId: buyer.id,
        shippingCost: new Prisma.Decimal(0),
      },
    });
    for (let i = 0; i < opts.orderCount; i++) {
      const product = await prisma.product.create({
        data: {
          sellerId: seller.id,
          categoryId: category!.id,
          title: `P-${uniq}-${i}`,
          description: "x",
          price: new Prisma.Decimal(100),
          condition: "new" as any,
          status: "active" as any,
          quantity: 1,
          reservedQuantity: 0,
        },
      });
      await prisma.order.create({
        data: {
          orderNumber: `O-${uniq}-${i}`,
          buyerId: buyer.id,
          sellerId: seller.id,
          productId: product.id,
          checkoutGroupId: group.id,
          packageId: pkg.id,
          totalAmount: new Prisma.Decimal(100),
          subtotal: new Prisma.Decimal(100),
          commissionAmount: new Prisma.Decimal(10),
          buyerFeeAmount: new Prisma.Decimal(5),
          paymentExpiresAt: new Date(Date.now() + 3_600_000),
          status: OrderStatus.paid,
          quantity: 1,
          createdAt: opts.createdAt,
        },
      });
    }
    return { groupId: group.id };
  }

  it("limit=1: en yeni sepetin TUM siparisleri tek sayfada (bolunmez); meta grup sayar", async () => {
    // Tekli grup (eski) + 3-siparisli sepet (gelecek tarih → en yeni).
    await makeGroup({
      orderCount: 1,
      createdAt: new Date(Date.now() - 60_000),
    });
    const cart = await makeGroup({
      orderCount: 3,
      createdAt: new Date(Date.now() + 60_000),
    });

    const totalGroups = await prisma.checkoutGroup.count();

    const page1: any = await admin.getOrders({ page: 1, limit: 1 } as any);
    // meta grup sayar (order degil): limit=1 → totalPages = grup sayisi.
    expect(page1.meta.total).toBe(totalGroups);
    expect(page1.meta.totalPages).toBe(totalGroups);
    // 3-siparisli sepetin TAMAMI tek sayfada — bolunme yok.
    expect(page1.data).toHaveLength(3);
    expect(new Set(page1.data.map((o: any) => o.checkoutGroupId))).toEqual(
      new Set([cart.groupId]),
    );
    expect(page1.data.every((o: any) => o.groupItemCount === 3)).toBe(true);
  });

  it("sonraki sayfa tekli sepeti dondurur (1'lik grup)", async () => {
    await makeGroup({
      orderCount: 1,
      createdAt: new Date(Date.now() - 60_000),
    });
    const cart = await makeGroup({
      orderCount: 3,
      createdAt: new Date(Date.now() + 60_000),
    });

    // Sayfa 1 = en yeni sepet; sonraki sayfada tekli grup gelmeli.
    const totalGroups = await prisma.checkoutGroup.count();
    const last: any = await admin.getOrders({
      page: totalGroups,
      limit: 1,
    } as any);
    expect(last.data).toHaveLength(1);
    expect(last.data[0].groupItemCount).toBe(1);
    expect(last.data[0].checkoutGroupId).not.toBe(cart.groupId);
  });
});
