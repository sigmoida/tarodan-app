import {
  ListingRemovalReason,
  ProductInactiveReason,
  ProductStatus,
} from "@prisma/client";
import {
  isListingRemovalTransition,
  recordListingRemovals,
  stockStatusRemovalReason,
} from "./listing-removal";

/**
 * Kaldırma nedenini kaydetmenin TEK yolu. Her kaldırma ekleme-yalnız bir olay
 * satırı + ilanın güncel nedeni (Product.removalReason) yazar; kaldırma
 * olmayan geçişler (vitrine dönüş, aynı statünün yeniden yazımı) hiçbir şey
 * yazmaz.
 */
describe("recordListingRemovals", () => {
  const makeDb = () => ({
    productRemovalEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  });

  it("bir kaldırmayı olay olarak kaydeder ve ilanın güncel nedenini damgalar", async () => {
    const db = makeDb();

    const count = await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.deleted,
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "dolap",
        detail: "Dolap'ta sattım",
        actorUserId: "seller-1",
      },
    ]);

    expect(count).toBe(1);
    expect(db.productRemovalEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: "p1",
          reason: ListingRemovalReason.sold_elsewhere,
          platform: "dolap",
          violationCode: null,
          detail: "Dolap'ta sattım",
          statusBefore: ProductStatus.active,
          statusAfter: ProductStatus.deleted,
          actorUserId: "seller-1",
        },
      ],
    });
    // Güncel neden yalnız ilan hâlâ yeni statüdeyse yazılır.
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["p1"] }, status: ProductStatus.deleted },
      data: { removalReason: ListingRemovalReason.sold_elsewhere },
    });
  });

  it("eksik opsiyonel alanlar null yazılır (sistem kaldırması: aktörsüz)", async () => {
    const db = makeDb();

    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.expired,
      },
    ]);

    expect(db.productRemovalEvent.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        platform: null,
        violationCode: null,
        detail: null,
        actorUserId: null,
      }),
    );
  });

  it.each([
    ["vitrine dönüş (active)", ProductStatus.inactive, ProductStatus.active],
    ["satış (sold)", ProductStatus.reserved, ProductStatus.sold],
    ["aynı statünün yeniden yazımı", ProductStatus.inactive, ProductStatus.inactive],
  ])("kaldırma olmayan geçişte (%s) hiçbir şey yazmaz", async (_l, from, to) => {
    const db = makeDb();

    const count = await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: from,
        statusAfter: to,
        reason: ListingRemovalReason.out_of_stock,
      },
    ]);

    expect(count).toBe(0);
    expect(db.productRemovalEvent.createMany).not.toHaveBeenCalled();
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("toplu kaldırmada (neden, statü) başına tek damga yazımı yapar", async () => {
    const db = makeDb();

    const count = await recordListingRemovals(db as any, [
      {
        productId: "a",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.suspended,
        reason: ListingRemovalReason.seller_suspended,
      },
      {
        productId: "b",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.suspended,
        reason: ListingRemovalReason.seller_suspended,
      },
      {
        productId: "c",
        statusBefore: ProductStatus.pending,
        statusAfter: ProductStatus.rejected,
        reason: ListingRemovalReason.seller_suspended,
      },
    ]);

    expect(count).toBe(3);
    expect(db.productRemovalEvent.createMany).toHaveBeenCalledTimes(1);
    expect(db.productRemovalEvent.createMany.mock.calls[0][0].data).toHaveLength(
      3,
    );
    expect(db.product.updateMany).toHaveBeenCalledTimes(2);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, status: ProductStatus.suspended },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c"] }, status: ProductStatus.rejected },
      data: { removalReason: ListingRemovalReason.seller_suspended },
    });
  });

  it("boş liste no-op'tur", async () => {
    const db = makeDb();
    expect(await recordListingRemovals(db as any, [])).toBe(0);
    expect(db.productRemovalEvent.createMany).not.toHaveBeenCalled();
  });

  /**
   * Olaylar ekleme-yalnızdır: ilan kaldırılır, yeniden açılır, tekrar
   * kaldırılırsa İKİ olay vardır (dashboard ikisini de kendi anında sayar).
   * Aradaki yeniden açılış bir kaldırma değildir, kayıt üretmez.
   */
  it("kaldır → yeniden aç → tekrar kaldır: iki olay", async () => {
    const db = makeDb();
    const events: unknown[] = [];
    db.productRemovalEvent.createMany.mockImplementation(
      async ({ data }: { data: unknown[] }) => {
        events.push(...data);
        return { count: data.length };
      },
    );

    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        reason: ListingRemovalReason.paused_temporarily,
        actorUserId: "seller-1",
      },
    ]);
    // Satıcı yeniden açar (inactive → pending): kaldırma değil.
    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.pending,
        reason: ListingRemovalReason.paused_temporarily,
      },
    ]);
    await recordListingRemovals(db as any, [
      {
        productId: "p1",
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.deleted,
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "letgo",
        actorUserId: "seller-1",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events).toEqual([
      expect.objectContaining({
        reason: ListingRemovalReason.paused_temporarily,
        statusAfter: ProductStatus.inactive,
      }),
      expect.objectContaining({
        reason: ListingRemovalReason.sold_elsewhere,
        platform: "letgo",
        statusAfter: ProductStatus.deleted,
      }),
    ]);
  });
});

describe("isListingRemovalTransition", () => {
  it("yalnız kaldırma statüsüne ve statü değişince true", () => {
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.rejected,
      }),
    ).toBe(true);
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.inactive,
        statusAfter: ProductStatus.deleted,
      }),
    ).toBe(true);
    expect(
      isListingRemovalTransition({
        statusBefore: ProductStatus.deleted,
        statusAfter: ProductStatus.pending,
      }),
    ).toBe(false);
  });
});

describe("stockStatusRemovalReason", () => {
  it("karantina davranış işaretiyle aynı adı taşır, diğer her stok düşüşü 'stok tükendi'", () => {
    expect(
      stockStatusRemovalReason(ProductInactiveReason.return_quarantine),
    ).toBe(ListingRemovalReason.return_quarantine);
    expect(stockStatusRemovalReason(null)).toBe(
      ListingRemovalReason.out_of_stock,
    );
    expect(stockStatusRemovalReason(undefined)).toBe(
      ListingRemovalReason.out_of_stock,
    );
  });
});
