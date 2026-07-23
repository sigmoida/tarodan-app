import { OrderQueryService } from "./order-query.service";

/**
 * Faz 3: buildPackagesView — grup order'larını SATICI PAKETİ (çatı) hiyerarşisine
 * gruplar. UI satıcı başına tek kart gösterebilsin: tek kargo takibi (paylaşılan
 * gönderi) + tek kargo ücreti + o satıcının ürün satırları.
 */
describe("OrderQueryService.buildPackagesView (Faz 3)", () => {
  const makeService = () => {
    const orderCommon = {
      // Formatlı order: testte sadece id'yi geri veriyoruz (gruplamayı doğrulamak yeter).
      formatOrderResponse: jest
        .fn()
        .mockImplementation((o: any) => Promise.resolve({ id: o.id })),
    } as any;
    return new OrderQueryService({} as any, orderCommon);
  };

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

  it("aynı satıcının 2 order'ı TEK pakette; farklı satıcı ayrı pakette", async () => {
    const svc = makeService();
    const orders = [
      {
        id: "o1",
        packageId: "pkg-A",
        seller: sellerA,
        shipment: {
          trackingNumber: "ORD-1",
          providerTrackingId: "SURAT-A",
          provider: "surat",
          status: "in_transit",
          trackingUrl: "u",
          shippedAt: null,
          deliveredAt: null,
        },
      },
      { id: "o2", packageId: "pkg-A", seller: sellerA, shipment: null },
      {
        id: "o3",
        packageId: "pkg-B",
        seller: sellerB,
        shipment: {
          trackingNumber: "ORD-3",
          providerTrackingId: "SURAT-B",
          provider: "surat",
          status: "pending",
          trackingUrl: null,
          shippedAt: null,
          deliveredAt: null,
        },
      },
    ];
    const packagesMeta = [
      { id: "pkg-A", sellerId: "sA", shippingCost: 29.99 },
      { id: "pkg-B", sellerId: "sB", shippingCost: 0 },
    ];

    const packages = await (svc as any).buildPackagesView(
      orders,
      packagesMeta,
      "buyer-1",
    );

    expect(packages).toHaveLength(2);
    const pkgA = packages.find((p: any) => p.id === "pkg-A");
    const pkgB = packages.find((p: any) => p.id === "pkg-B");

    // Paket A: 2 ürün, tek kargo ücreti 29.99, paylaşılan kargo (ilk shipment)
    expect(pkgA.orders).toHaveLength(2);
    expect(pkgA.sellerId).toBe("sA");
    expect(pkgA.seller.displayName).toBe("A Store");
    expect(pkgA.shippingCost).toBe(29.99);
    expect(pkgA.cargo.cargoCode).toBe("SURAT-A");
    expect(pkgA.cargo.status).toBe("in_transit");

    // Paket B: 1 ürün, kendi ücreti + kendi kargosu
    expect(pkgB.orders).toHaveLength(1);
    expect(pkgB.sellerId).toBe("sB");
    expect(pkgB.shippingCost).toBe(0);
    expect(pkgB.cargo.cargoCode).toBe("SURAT-B");
  });

  it("paketsiz (legacy) order kendi grubunda döner, patlamaz", async () => {
    const svc = makeService();
    const orders = [
      { id: "o9", packageId: null, seller: sellerA, shipment: null },
    ];

    const packages = await (svc as any).buildPackagesView(
      orders,
      [],
      "buyer-1",
    );

    expect(packages).toHaveLength(1);
    expect(packages[0].orders).toHaveLength(1);
    expect(packages[0].shippingCost).toBe(0);
    expect(packages[0].cargo).toBeNull();
  });
});
