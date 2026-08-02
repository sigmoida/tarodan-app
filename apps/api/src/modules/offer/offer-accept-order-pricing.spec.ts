import { OfferService } from "./offer.service";
import { OfferStatus, ProductStatus } from "@prisma/client";

/**
 * BLOCKER: teklif kabulünde oluşturulan sipariş yalnız komisyonu yazıyordu;
 * `taxAmount`, `withholdingTaxAmount`, `shippingCost` ve `subtotal` @default(0)
 * kalıyordu. Ödeme `order.totalAmount`'ı olduğu gibi tahsil ettiği için kurumsal
 * satıcının teklif satışında KDV tahsil edilmiyor, stopaj kesilmiyor ve kargo
 * bedava veriliyordu. Sipariş artık normal satışla aynı bedel primitifinden
 * beslenir.
 */
describe("OfferService.accept — order carries shipping, VAT and withholding", () => {
  const offer = {
    id: "offer-1",
    status: OfferStatus.pending,
    amount: 1000,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    product: {
      id: "product-1",
      title: "Ürün",
      sellerId: "seller-1",
      categoryId: "cat-1",
      status: ProductStatus.active,
      shippingDesi: 2,
      price: 1200,
      images: [],
    },
    buyer: { id: "buyer-1", displayName: "Alıcı", email: "b@x.com" },
    seller: { id: "seller-1", displayName: "Satıcı", email: "s@x.com" },
  };

  const offerPricing = {
    commission: {
      commissionAmount: 30,
      buyerFeeAmount: 10,
      sellerFeeAmount: 20,
      buyerCommissionAmount: 4,
      buyerServiceFeeAmount: 6,
      sellerCommissionAmount: 15,
      sellerPlatformFeeAmount: 5,
      shippingBuyerShare: 100,
    },
    fullShippingAmount: 80,
    buyerShippingAmount: 80,
    sellerShippingAmount: 0,
    taxAmount: 200,
    withholdingTaxAmount: 10,
    totalAmount: 1290, // 1000 + 80 + 10 + 200
  };

  const makeService = () => {
    const created: any[] = [];
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "offer-1" }]),
      offer: {
        findUnique: jest.fn().mockResolvedValue({ ...offer, order: null }),
        update: jest.fn().mockResolvedValue({ ...offer }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: { findUnique: jest.fn().mockResolvedValue(offer.product) },
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((arg: any) => {
          created.push(arg.data);
          return Promise.resolve({ id: "order-1", ...arg.data });
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      offer: { findUnique: jest.fn().mockResolvedValue({ ...offer }) },
    };
    const checkoutCommon = {
      resolveOfferOrderPricing: jest.fn().mockResolvedValue(offerPricing),
    };
    const service = new OfferService(
      prisma as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => undefined } as any,
      { emitOfferAccepted: jest.fn() } as any,
      { notifyOfferAccepted: jest.fn() } as any,
      {
        calculateCommission: jest
          .fn()
          .mockResolvedValue(offerPricing.commission),
      } as any,
      {
        checkAndReserve: jest.fn(),
        lockProductForUpdate: jest.fn().mockResolvedValue(offer.product),
      } as any,
      undefined as any,
      checkoutCommon as any,
    );
    return { service, created, checkoutCommon, tx };
  };

  it("sipariş KDV, stopaj, kargo ve alt toplamı taşır", async () => {
    const { service, created } = makeService();

    await service.accept("offer-1", "seller-1");

    expect(created).toHaveLength(1);
    const order = created[0];
    expect(Number(order.taxAmount)).toBe(200);
    expect(Number(order.withholdingTaxAmount)).toBe(10);
    expect(Number(order.shippingCost)).toBe(80);
    expect(Number(order.subtotal)).toBe(1000);
    // Toplam artık KDV + kargoyu içerir (eski davranış: 1010).
    expect(Number(order.totalAmount)).toBe(1290);
  });

  it("bedeller ortak primitiften alınır (teklif tutarı ve ürün desisi ile)", async () => {
    const { service, checkoutCommon } = makeService();

    await service.accept("offer-1", "seller-1");

    expect(checkoutCommon.resolveOfferOrderPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        sellerId: "seller-1",
        categoryId: "cat-1",
        shippingDesi: 2,
      }),
    );
  });

  it("kargo alıcı/satıcı payları siparişe yazılır", async () => {
    const { service, created } = makeService();

    await service.accept("offer-1", "seller-1");

    expect(Number(created[0].buyerShippingAmount)).toBe(80);
    expect(Number(created[0].sellerShippingAmount)).toBe(0);
  });
});
