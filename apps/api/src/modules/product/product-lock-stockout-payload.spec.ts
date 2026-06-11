import { ProductLockService } from './product-lock.service';

/**
 * Regression: invalidatePendingOrdersForProduct must report each cancelled
 * order's origin so the caller can pick the right stockout notification.
 *
 * An accepted-but-unpaid offer creates a pending_payment Order with offerId set
 * and NO payment row. When stock runs out, that buyer should get
 * "Teklifiniz iptal edildi" (offer-cancelled), not "Siparişiniz iptal edildi".
 * Direct-buy / already-paying orders keep the order-cancelled message.
 */
describe('ProductLockService.invalidatePendingOrdersForProduct payload', () => {
  const productId = 'prod-1';

  const offerUnpaidOrder = {
    id: 'order-offer',
    buyerId: 'buyer-offer',
    productId,
    offerId: 'offer-1',
    product: { title: 'Teklif Ürünü' },
    payment: null,
  };
  const directBuyOrder = {
    id: 'order-direct',
    buyerId: 'buyer-direct',
    productId,
    offerId: null,
    product: { title: 'Doğrudan Ürün' },
    payment: { id: 'pay-1' },
  };

  function buildService(orders: any[]) {
    const tx = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        updateMany: jest.fn().mockResolvedValue({ count: orders.length }),
      },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new ProductLockService({} as any, {} as any);
    return { service, tx };
  }

  it('flags offer-origin unpaid orders (offerId set, hadPayment=false)', async () => {
    const { service, tx } = buildService([offerUnpaidOrder]);

    const result = await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      'Stok tükendi',
    );

    expect(result.cancelledOrders).toEqual([
      expect.objectContaining({
        orderId: 'order-offer',
        buyerId: 'buyer-offer',
        offerId: 'offer-1',
        hadPayment: false,
      }),
    ]);
  });

  it('flags direct-buy / paying orders as hadPayment=true, offerId=null', async () => {
    const { service, tx } = buildService([directBuyOrder]);

    const result = await service.invalidatePendingOrdersForProduct(
      tx as any,
      productId,
      'Stok tükendi',
    );

    expect(result.cancelledOrders[0]).toEqual(
      expect.objectContaining({ offerId: null, hadPayment: true }),
    );
  });
});
