import { ForbiddenException } from "@nestjs/common";
import { OrderQueryService } from "./order-query.service";

/**
 * Grup-çatı görünümü: web/admin "her şey grup şemsiyesi altında" tasarımının
 * sorgu katmanı.
 *  - findGroupViewByOrder: order id'den grup görünümüne çözümleme; grupsuz
 *    (teklif kabulü gibi) siparişler TEK siparişlik sentetik grup olur.
 *  - findCheckoutGroup: satıcı da kendi paket dilimini görebilir (ödeme tutarı
 *    ve diğer satıcıların siparişleri sızmaz).
 *  - findUserOrderGroups: alıcı için CheckoutGroup + grupsuz sipariş birleşik
 *    sayfalı liste; satıcı için çatı = kendi OrderPackage'ı.
 */
describe("OrderQueryService group-umbrella views", () => {
  const sellerA = {
    id: "sA",
    displayName: "A Store",
    avatarUrl: null,
    isVerified: true,
  };
  const sellerB = {
    id: "sB",
    displayName: "B Store",
    avatarUrl: null,
    isVerified: false,
  };
  const buyer = {
    id: "buyer-1",
    displayName: "Buyer",
    avatarUrl: null,
    isVerified: false,
  };

  const makeService = (prismaOverrides: Record<string, any> = {}) => {
    const prisma: any = {
      checkoutGroup: { findUnique: jest.fn(), findMany: jest.fn() },
      order: { findUnique: jest.fn(), findMany: jest.fn() },
      orderPackage: { findMany: jest.fn() },
      ...prismaOverrides,
    };
    const orderCommon = {
      formatOrderResponse: jest
        .fn()
        .mockImplementation((o: any) => Promise.resolve({ id: o.id })),
    } as any;
    return { svc: new OrderQueryService(prisma, orderCommon), prisma };
  };

  const groupOrder = (id: string, over: Record<string, any> = {}) => ({
    id,
    orderNumber: `ORD-${id}`,
    buyerId: "buyer-1",
    sellerId: "sA",
    packageId: "pkg-A",
    status: "paid",
    totalAmount: 100,
    shippingCost: 0,
    createdAt: new Date("2026-07-01"),
    product: { images: [] },
    buyer,
    seller: sellerA,
    shipment: null,
    refundRequests: [],
    ...over,
  });

  const fullGroup = () => ({
    id: "grp-1",
    groupNumber: "GRP-100",
    buyerId: "buyer-1",
    totalAmount: 300,
    createdAt: new Date("2026-07-01"),
    payment: {
      id: "pay-1",
      status: "completed",
      amount: 300,
      provider: "paytr",
      paidAt: new Date("2026-07-01"),
    },
    packages: [
      { id: "pkg-A", sellerId: "sA", shippingCost: 29.99 },
      { id: "pkg-B", sellerId: "sB", shippingCost: 0 },
    ],
    orders: [
      groupOrder("o1"),
      groupOrder("o2", { totalAmount: 100 }),
      groupOrder("o3", {
        sellerId: "sB",
        packageId: "pkg-B",
        seller: sellerB,
        totalAmount: 100,
      }),
    ],
  });

  describe("findCheckoutGroup — viewer slices", () => {
    it("alıcı tam grubu görür: ödeme + tüm paketler + viewerRole=buyer", async () => {
      const { svc, prisma } = makeService();
      prisma.checkoutGroup.findUnique.mockResolvedValue(fullGroup());

      const view = await svc.findCheckoutGroup("grp-1", "buyer-1");

      expect(view.viewerRole).toBe("buyer");
      expect(view.payment?.amount).toBe(300);
      expect(view.packages).toHaveLength(2);
      expect(view.orders).toHaveLength(3);
    });

    it("satıcı yalnız KENDİ paket dilimini görür: ödeme yok, diğer satıcının siparişi yok, toplam kendi siparişleri", async () => {
      const { svc, prisma } = makeService();
      prisma.checkoutGroup.findUnique.mockResolvedValue(fullGroup());

      const view = await svc.findCheckoutGroup("grp-1", "sA");

      expect(view.viewerRole).toBe("seller");
      expect(view.payment).toBeNull();
      expect(view.packages).toHaveLength(1);
      expect(view.packages[0].id).toBe("pkg-A");
      expect(view.orders.map((o: any) => o.id).sort()).toEqual(["o1", "o2"]);
      // Kendi dilim toplamı: 100 + 100 (o3 dahil değil)
      expect(view.totalAmount).toBe(200);
    });

    it("grupla ilgisi olmayan kullanıcı Forbidden alır", async () => {
      const { svc, prisma } = makeService();
      prisma.checkoutGroup.findUnique.mockResolvedValue(fullGroup());

      await expect(svc.findCheckoutGroup("grp-1", "stranger")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("findGroupViewByOrder — order id'den çatıya", () => {
    it("gruplu sipariş grup görünümüne çözümlenir", async () => {
      const { svc, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValue({
        id: "o1",
        buyerId: "buyer-1",
        sellerId: "sA",
        checkoutGroupId: "grp-1",
      });
      prisma.checkoutGroup.findUnique.mockResolvedValue(fullGroup());

      const view = await svc.findGroupViewByOrder("o1", "buyer-1");

      expect(view.id).toBe("grp-1");
      expect(view.kind).toBe("group");
    });

    it("grupsuz (teklif) sipariş TEK siparişlik sentetik grup döner: kargo ücreti siparişten, ödeme order.payment'tan", async () => {
      const { svc, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValue(
        groupOrder("o9", {
          checkoutGroupId: null,
          packageId: null,
          shippingCost: 49.9,
          totalAmount: 550,
          payment: {
            id: "pay-9",
            status: "completed",
            amount: 550,
            provider: "paytr",
            paidAt: new Date("2026-07-02"),
          },
        }),
      );

      const view = await svc.findGroupViewByOrder("o9", "buyer-1");

      expect(view.kind).toBe("synthetic");
      expect(view.id).toBe("o9");
      expect(view.groupNumber).toBe("ORD-o9");
      expect(view.totalAmount).toBe(550);
      expect(view.payment?.id).toBe("pay-9");
      expect(view.packages).toHaveLength(1);
      expect(view.packages[0].shippingCost).toBe(49.9);
      expect(view.orders).toHaveLength(1);
    });

    it("sentetik görünümde satıcı ödeme bilgisini görmez", async () => {
      const { svc, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValue(
        groupOrder("o9", {
          checkoutGroupId: null,
          packageId: null,
          payment: { id: "pay-9", status: "completed", amount: 550 },
        }),
      );

      const view = await svc.findGroupViewByOrder("o9", "sA");

      expect(view.viewerRole).toBe("seller");
      expect(view.payment).toBeNull();
    });

    it("alıcı/satıcı olmayan kullanıcı Forbidden alır", async () => {
      const { svc, prisma } = makeService();
      prisma.order.findUnique.mockResolvedValue(
        groupOrder("o9", { checkoutGroupId: null }),
      );

      await expect(svc.findGroupViewByOrder("o9", "stranger")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("findUserOrderGroups — birleşik sayfalı liste", () => {
    it("alıcı: CheckoutGroup + grupsuz sipariş createdAt'e göre birleşir; sentetik satır kind=synthetic", async () => {
      const { svc, prisma } = makeService();
      // Aday (hafif) sorgular
      prisma.checkoutGroup.findMany
        .mockResolvedValueOnce([
          { id: "grp-1", createdAt: new Date("2026-07-01") },
        ])
        // Hidrasyon
        .mockResolvedValueOnce([fullGroup()]);
      prisma.order.findMany
        .mockResolvedValueOnce([
          { id: "o9", createdAt: new Date("2026-07-05") },
        ])
        .mockResolvedValueOnce([
          groupOrder("o9", {
            checkoutGroupId: null,
            packageId: null,
            createdAt: new Date("2026-07-05"),
            payment: { id: "pay-9", status: "completed", amount: 100 },
          }),
        ]);

      const res = await svc.findUserOrderGroups("buyer-1", {
        role: "buyer",
        tab: "active",
        page: 1,
        limit: 20,
      });

      expect(res.meta.total).toBe(2);
      // En yeni önce: sentetik (07-05) > grup (07-01)
      expect(res.data[0].kind).toBe("synthetic");
      expect(res.data[0].id).toBe("o9");
      expect(res.data[1].kind).toBe("group");
      expect(res.data[1].id).toBe("grp-1");
      // Alıcı listesinde grup ödemesi özet olarak var
      expect(res.data[1].payment?.status).toBe("completed");
    });

    it("alıcı: iptal sekmesi grubu üyelikle seçer ama TAM üye kümesini döndürür", async () => {
      const { svc, prisma } = makeService();
      const grp = fullGroup();
      grp.orders[1] = groupOrder("o2", { status: "cancelled" });
      prisma.checkoutGroup.findMany
        .mockResolvedValueOnce([{ id: "grp-1", createdAt: grp.createdAt }])
        .mockResolvedValueOnce([grp]);
      prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await svc.findUserOrderGroups("buyer-1", {
        role: "buyer",
        tab: "cancelled",
        page: 1,
        limit: 20,
      });

      // Seçim where'i üyelik koşulu taşır…
      const lightWhere = prisma.checkoutGroup.findMany.mock.calls[0][0].where;
      expect(lightWhere.orders.some.status).toBe("cancelled");
      // …ama karta tüm siparişler döner (filtre satın almayı değil seçimi daraltır)
      expect(res.data[0].orders).toHaveLength(3);
    });

    it("satıcı: çatı kendi OrderPackage'ı; grup numarası paketin ortak referansı (en küçük orderNumber)", async () => {
      const { svc, prisma } = makeService();
      prisma.orderPackage.findMany
        .mockResolvedValueOnce([
          { id: "pkg-A", createdAt: new Date("2026-07-01") },
        ])
        .mockResolvedValueOnce([
          {
            id: "pkg-A",
            sellerId: "sA",
            shippingCost: 29.99,
            createdAt: new Date("2026-07-01"),
            orders: [
              groupOrder("o2", { orderNumber: "ORD-B" }),
              groupOrder("o1", { orderNumber: "ORD-A" }),
            ],
          },
        ]);
      prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const res = await svc.findUserOrderGroups("sA", {
        role: "seller",
        tab: "active",
        page: 1,
        limit: 20,
      });

      expect(res.meta.total).toBe(1);
      const row = res.data[0];
      expect(row.kind).toBe("package");
      expect(row.groupNumber).toBe("ORD-A");
      expect(row.payment).toBeNull();
      expect(row.totalAmount).toBe(200);
      expect(row.packages).toHaveLength(1);
      expect(row.packages[0].shippingCost).toBe(29.99);
    });

    it("sayfalama birleşik listede çalışır: limit dilimi uygulanır, total tümünü sayar", async () => {
      const { svc, prisma } = makeService();
      prisma.checkoutGroup.findMany
        .mockResolvedValueOnce([
          { id: "grp-1", createdAt: new Date("2026-07-03") },
          { id: "grp-2", createdAt: new Date("2026-07-01") },
        ])
        .mockResolvedValueOnce([{ ...fullGroup(), id: "grp-1" }]);
      prisma.order.findMany
        .mockResolvedValueOnce([
          { id: "o9", createdAt: new Date("2026-07-05") },
        ])
        .mockResolvedValueOnce([
          groupOrder("o9", {
            checkoutGroupId: null,
            packageId: null,
            createdAt: new Date("2026-07-05"),
          }),
        ]);

      const res = await svc.findUserOrderGroups("buyer-1", {
        role: "buyer",
        tab: "active",
        page: 1,
        limit: 2,
      });

      expect(res.meta.total).toBe(3);
      expect(res.meta.totalPages).toBe(2);
      // İlk sayfa: o9 (sentetik) + grp-1; grp-2 ikinci sayfada
      expect(res.data.map((g: any) => g.id)).toEqual(["o9", "grp-1"]);
    });
  });
});
