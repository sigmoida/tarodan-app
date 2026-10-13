import {
  ListingRemovalReason,
  OfferStatus,
  ProductKind,
  ProductStatus,
} from "@prisma/client";
import {
  ACCOUNT_DELETION_BLOCKING_LISTING_STATUSES,
  ACCOUNT_DELETION_DEACTIVATED_STATUSES,
  deactivateListingsForAccountDeletion,
} from "./account-deletion-listings";
import { OFFER_CANCEL_REASON } from "../../trade/helpers/trade-cancel-reasons";

/**
 * S3 — Apple 5.1.1(v), Play hesap silme politikası: aktif ilan hesap silmeyi
 * engellemez. Silme transaction'ı yayındaki ve onay bekleyen ilanları pasife
 * alır, nedeni `account_deleted` olarak kaydeder ve açık teklifleri kapatır.
 */
describe("deactivateListingsForAccountDeletion", () => {
  const makeTx = (
    listings: Array<{ id: string; status: ProductStatus }>,
    /** Yazımdan sonra inactive okunanlar (varsayılan: hepsi). */
    deactivatedIds: string[] = listings.map((listing) => listing.id),
    openOffers: Array<{ id: string; buyerId: string; productId: string }> = [
      { id: "o1", buyerId: "b1", productId: "p-active" },
    ],
  ) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    product: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(listings)
        .mockResolvedValueOnce(deactivatedIds.map((id) => ({ id }))),
      updateMany: jest.fn().mockResolvedValue({ count: listings.length }),
    },
    productRemovalEvent: {
      createMany: jest.fn().mockResolvedValue({ count: listings.length }),
    },
    offer: {
      findMany: jest.fn().mockResolvedValue(openOffers),
      updateMany: jest.fn().mockResolvedValue({ count: openOffers.length }),
    },
  });

  const listings = [
    { id: "p-active", status: ProductStatus.active },
    { id: "p-pending", status: ProductStatus.pending },
  ];

  it("yalnız satıcının yayındaki ve onay bekleyen katalog ilanlarını seçer", async () => {
    const tx = makeTx(listings);

    await deactivateListingsForAccountDeletion(tx as never, "seller-1");

    expect(tx.product.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        kind: ProductKind.listing,
        sellerId: "seller-1",
        status: { in: [ProductStatus.active, ProductStatus.pending] },
      },
      select: { id: true, status: true },
    });
  });

  it("ilanları pasife alır ve kimliklerini döner", async () => {
    const tx = makeTx(listings);

    const { productIds: ids } = await deactivateListingsForAccountDeletion(
      tx as never,
      "seller-1",
    );

    expect(ids).toEqual(["p-active", "p-pending"]);
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: { in: ["p-active", "p-pending"] },
        status: { in: [ProductStatus.active, ProductStatus.pending] },
      },
      data: { status: ProductStatus.inactive },
    });
  });

  it("her ilan için account_deleted nedeniyle kaldırma kaydı yazar", async () => {
    const tx = makeTx(listings);

    await deactivateListingsForAccountDeletion(tx as never, "seller-1");

    const rows = tx.productRemovalEvent.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({
        productId: "p-active",
        reason: ListingRemovalReason.account_deleted,
        statusBefore: ProductStatus.active,
        statusAfter: ProductStatus.inactive,
        fromStorefront: true,
        actorUserId: "seller-1",
      }),
      expect.objectContaining({
        productId: "p-pending",
        reason: ListingRemovalReason.account_deleted,
        statusBefore: ProductStatus.pending,
        // Onay bekleyen ilan vitrinde değildi: dashboard'da sayılmaz.
        fromStorefront: false,
      }),
    ]);
  });

  it("bu ilanlardaki açık teklifleri gerekçeyle kapatır ve alıcıları döner", async () => {
    const tx = makeTx(listings);

    const result = await deactivateListingsForAccountDeletion(
      tx as never,
      "seller-1",
    );

    const openOfferWhere = {
      productId: { in: ["p-active", "p-pending"] },
      OR: [
        { status: OfferStatus.pending },
        // Siparişi hiç açılmamış kabul (savunma); siparişli kabul edilmiş
        // teklif ya açık sipariş engeline takılır ya da satış geçmişidir.
        { status: OfferStatus.accepted, order: { is: null } },
      ],
    };
    expect(tx.offer.findMany).toHaveBeenCalledWith({
      where: openOfferWhere,
      select: { id: true, buyerId: true, productId: true },
    });
    expect(tx.offer.updateMany).toHaveBeenCalledWith({
      where: { ...openOfferWhere, id: { in: ["o1"] } },
      data: {
        status: OfferStatus.cancelled,
        cancelReason: OFFER_CANCEL_REASON.listingDeleted,
      },
    });
    expect(result.cancelledOffers).toEqual([
      { id: "o1", buyerId: "b1", productId: "p-active" },
    ]);
  });

  it("açık teklif yoksa teklif yazımı yapılmaz", async () => {
    const tx = makeTx(listings, undefined, []);

    const result = await deactivateListingsForAccountDeletion(
      tx as never,
      "seller-1",
    );

    expect(tx.offer.updateMany).not.toHaveBeenCalled();
    expect(result.cancelledOffers).toEqual([]);
  });

  it("ilan yoksa hiçbir şey yazmaz", async () => {
    const tx = makeTx([]);

    const { productIds: ids } = await deactivateListingsForAccountDeletion(
      tx as never,
      "seller-1",
    );

    expect(ids).toEqual([]);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productRemovalEvent.createMany).not.toHaveBeenCalled();
    expect(tx.offer.updateMany).not.toHaveBeenCalled();
  });

  it("rezerve ilan pasife alınmaz, silmeyi engellemeye devam eder", () => {
    expect(ACCOUNT_DELETION_DEACTIVATED_STATUSES).not.toContain(
      ProductStatus.reserved,
    );
    expect(ACCOUNT_DELETION_BLOCKING_LISTING_STATUSES).toEqual([
      ProductStatus.reserved,
    ]);
  });

  it("locks the seller's open listing rows before reading them", async () => {
    const tx = makeTx(listings);

    await deactivateListingsForAccountDeletion(tx as never, "seller-1");

    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join("?");
    expect(sql).toContain("FOR UPDATE");
    // Sabit kilit sırası: eşzamanlı işlemler kilitlenmesin.
    expect(sql.replace(/\s+/g, " ")).toContain("ORDER BY id FOR UPDATE");
    expect(sql).toContain("'reserved'");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.product.findMany.mock.invocationCallOrder[0],
    );
  });

  // Okuma ile yazım arasında rezerve olan ilan: kayıt, teklif kapatma ve
  // dönen kimlikler yalnız GERÇEKTEN pasife alınan satırlardan gelir.
  it("uses only the rows the update actually changed", async () => {
    const tx = makeTx(listings, ["p-pending"]);

    const { productIds: ids } = await deactivateListingsForAccountDeletion(
      tx as never,
      "seller-1",
    );

    expect(ids).toEqual(["p-pending"]);
    const rows = tx.productRemovalEvent.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { productId: string }) => row.productId)).toEqual([
      "p-pending",
    ]);
    expect(tx.offer.findMany.mock.calls[0][0].where.productId).toEqual({
      in: ["p-pending"],
    });
  });

  it("nothing changed → no removal record, no offer change", async () => {
    const tx = makeTx(listings, []);

    await expect(
      deactivateListingsForAccountDeletion(tx as never, "seller-1"),
    ).resolves.toEqual({ productIds: [], cancelledOffers: [] });
    expect(tx.productRemovalEvent.createMany).not.toHaveBeenCalled();
    expect(tx.offer.findMany).not.toHaveBeenCalled();
    expect(tx.offer.updateMany).not.toHaveBeenCalled();
  });
});
