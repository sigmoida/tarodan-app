import { OrderCommonService } from "./order-common.service";

/**
 * Sipariş yanıtı iki tarafa da açıktır: alıcı satıcıyı, satıcı alıcıyı görür.
 * Bu yüzden `formatOrderResponse` her iki tarafı da HERKESE AÇIK kimlikle
 * yazar (bkz. common/helpers/public-identity). Gerçek ad yalnız faturada,
 * kargo etiketinde ve admin panelinde kalır.
 *
 * Misafir siparişi ayrı bir durumdur: alıcı satırı ortak sentetik hesaptır
 * (guest@tarodan.system / GUEST_SYSTEM), gerçek alıcı adı siparişin teslimat
 * verisinde durur. Satıcı kime göndereceğini görmeli — sentetik hesabı değil.
 */
describe("formatOrderResponse public identity", () => {
  const makeService = () =>
    new OrderCommonService(
      { productRating: {}, rating: {} } as any,
      { del: jest.fn(), delPattern: jest.fn() } as any,
      { getPublicAssetUrl: (k: string) => `https://cdn/${k}` } as any,
    );

  const baseOrder = {
    id: "order-1",
    orderNumber: "ORD-1",
    status: "paid",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    totalAmount: 100,
  };

  it("shows both parties by their public name", async () => {
    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        buyer: {
          id: "buyer-1",
          username: "kaan.merakli",
          displayName: "Kaan İlhan",
          companyName: null,
          isVerified: false,
        },
        seller: {
          id: "seller-1",
          username: "legacy_00000007",
          displayName: "Ayşe Yılmaz",
          companyName: "Tarodan Otomotiv A.Ş.",
          isVerified: true,
        },
      },
      "buyer-1",
    );

    expect(result.buyer.publicName).toBe("kaan.merakli");
    expect(result.buyer.displayName).toBe("kaan.merakli");
    expect(result.buyer.username).toBe("kaan.merakli");
    // Kurumsal satıcı firma adıyla görünür, yetkilinin adıyla değil.
    expect(result.seller.publicName).toBe("Tarodan Otomotiv A.Ş.");
    expect(result.seller.username).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Ayşe Yılmaz");
    expect(JSON.stringify(result)).not.toContain("Kaan İlhan");
  });

  it("falls back to the real name only for accounts without a username", async () => {
    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        buyer: {
          id: "buyer-1",
          username: "legacy_00000042",
          displayName: "Kaan İlhan",
          companyName: null,
        },
        seller: { id: "seller-1", username: "satici", displayName: "Ali Veli" },
      },
      "buyer-1",
    );

    expect(result.buyer.publicName).toBe("Kaan İlhan");
    expect(result.seller.publicName).toBe("satici");
  });

  it("names the real recipient on a guest order, not the shared system account", async () => {
    const result = await makeService().formatOrderResponse(
      {
        ...baseOrder,
        buyer: {
          id: "guest-system",
          username: "legacy_00000001",
          displayName: "GUEST_SYSTEM",
          companyName: null,
        },
        seller: { id: "seller-1", username: "satici", displayName: "Ali Veli" },
        shippingAddress: {
          isGuestOrder: true,
          guestName: "Mehmet Demir",
          fullName: "Mehmet Demir",
        },
      },
      "seller-1",
    );

    expect(result.buyer.publicName).toBe("Mehmet Demir");
    expect(result.buyer.username).toBeNull();
    expect(JSON.stringify(result)).not.toContain("GUEST_SYSTEM");
  });
});
