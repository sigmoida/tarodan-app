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
  const makeTx = (listings: Array<{ id: string; status: ProductStatus }>) => ({
    product: {
      findMany: jest.fn().mockResolvedValue(listings),
      updateMany: jest.fn().mockResolvedValue({ count: listings.length }),
    },
    productRemovalEvent: {
      createMany: jest.fn().mockResolvedValue({ count: listings.length }),
    },
    offer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  });

  const listings = [
    { id: "p-active", status: ProductStatus.active },
    { id: "p-pending", status: ProductStatus.pending },
  ];

  it("yalnız satıcının yayındaki ve onay bekleyen katalog ilanlarını seçer", async () => {
    const tx = makeTx(listings);

    await deactivateListingsForAccountDeletion(tx as never, "seller-1");

    expect(tx.product.findMany).toHaveBeenCalledWith({
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

    const ids = await deactivateListingsForAccountDeletion(
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

  it("bu ilanlardaki açık teklifleri gerekçeyle kapatır", async () => {
    const tx = makeTx(listings);

    await deactivateListingsForAccountDeletion(tx as never, "seller-1");

    expect(tx.offer.updateMany).toHaveBeenCalledWith({
      where: {
        productId: { in: ["p-active", "p-pending"] },
        status: OfferStatus.pending,
      },
      data: {
        status: OfferStatus.cancelled,
        cancelReason: OFFER_CANCEL_REASON.listingDeleted,
      },
    });
  });

  it("ilan yoksa hiçbir şey yazmaz", async () => {
    const tx = makeTx([]);

    const ids = await deactivateListingsForAccountDeletion(
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
});
