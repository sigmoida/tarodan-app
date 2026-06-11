import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { DiscountService } from '../discount/discount.service';
import { DiscountCalculator } from '../discount/discount-calculator';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { ProductLockService } from '../product/product-lock.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { OrderStatus, ProductStatus } from '@prisma/client';

/**
 * Toplu checkout (CheckoutGroup): sepetteki tüm ürünler tek grupta sipariş edilir,
 * tek ödeme grubu kapsar. Bu suite idempotensi, doğrulama ve atomiklik koruyucularını test eder.
 */
describe('OrderService checkout group (batch checkout)', () => {
  let service: OrderService;

  const buyerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const sellerId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const productA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  const productB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
  const addressId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const idempotencyKey = '11111111-1111-4111-8111-111111111111';

  const makeProduct = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    title: `Ürün ${id.slice(-1)}`,
    status: ProductStatus.active,
    sellerId,
    categoryId: null,
    price: 100,
    oldPrice: null,
    saleStartDate: null,
    saleEndDate: null,
    quantity: 5,
    reservedQuantity: 0,
    seller: { id: sellerId, email: 'seller@test.com', displayName: 'Seller' },
    ...overrides,
  });

  let mockTx: any;

  const mockPrisma: any = {
    user: { findUnique: jest.fn() },
    order: { count: jest.fn().mockResolvedValue(0) },
    checkoutGroup: {
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    commissionRule: { findMany: jest.fn().mockResolvedValue([]) },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    analyticsSnapshot: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: productA }, { id: productB }]),
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([makeProduct(productA), makeProduct(productB)]),
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: `order-${data.productId}`,
            orderNumber: data.orderNumber,
            productId: data.productId,
          }),
        ),
      },
      address: {
        findUnique: jest.fn().mockResolvedValue({
          id: addressId,
          userId: buyerId,
          title: 'Ev',
          fullName: 'Alıcı',
          phone: '+905551112233',
          city: 'İstanbul',
          district: 'Kadıköy',
          address: 'Test cad. 1',
          zipCode: '34000',
        }),
      },
      checkoutGroup: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'group-1', ...data }),
        ),
      },
    };

    mockPrisma.user.findUnique.mockResolvedValue({
      id: buyerId,
      isBanned: false,
      email: 'buyer@test.com',
      displayName: 'Buyer',
      sellerType: 'individual',
      membership: null,
    });
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue(null);
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.checkoutGroup.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn(), delPattern: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EventService, useValue: { emitOrderCreated: jest.fn() } },
        { provide: NotificationService, useValue: {} },
        {
          provide: DiscountService,
          useValue: { validateCoupon: jest.fn(), recordUsage: jest.fn() },
        },
        { provide: DiscountCalculator, useValue: {} },
        {
          provide: SuratCargoService,
          useValue: {
            isIntegrationEnabled: () => false,
            submitShipmentWithRetry: jest.fn(),
          },
        },
        { provide: ProductLockService, useValue: {} },
        { provide: CommissionLedgerService, useValue: {} },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  const baseDto = () => ({
    items: [{ productId: productA }, { productId: productB }],
    idempotencyKey,
    shippingAddressId: addressId,
  });

  it('creates one checkout group with an order per product (2 items → 1 group + 2 orders)', async () => {
    const result: any = await service.checkout(buyerId, baseDto() as any);

    expect(result.checkoutGroupId).toBe('group-1');
    expect(result.orders).toHaveLength(2);
    expect(mockTx.checkoutGroup.create).toHaveBeenCalledTimes(1);
    expect(mockTx.order.create).toHaveBeenCalledTimes(2);

    // Her sipariş gruba bağlanır
    for (const call of mockTx.order.create.mock.calls) {
      expect(call[0].data.checkoutGroupId).toBe('group-1');
      expect(call[0].data.status).toBe(OrderStatus.pending_payment);
    }

    // Grup toplamı sipariş toplamlarının toplamıdır
    const orderTotals = mockTx.order.create.mock.calls.map(
      (c: any) => c[0].data.totalAmount,
    );
    const groupTotal = mockTx.checkoutGroup.create.mock.calls[0][0].data.totalAmount;
    expect(groupTotal).toBeCloseTo(orderTotals.reduce((s: number, v: number) => s + v, 0));

    // Her ürün için 1 adet rezervasyon
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productA },
      data: { reservedQuantity: { increment: 1 } },
    });
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productB },
      data: { reservedQuantity: { increment: 1 } },
    });
  });

  it('idempotency replay: same key returns the existing group without running the transaction', async () => {
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue({
      id: 'group-existing',
      groupNumber: 'GRP-EXISTING',
      buyerId,
      totalAmount: 250,
      orders: [
        {
          id: 'order-1',
          orderNumber: 'ORD-1',
          productId: productA,
          totalAmount: 125,
          subtotal: 100,
          discountAmount: 0,
          discountCode: null,
        },
      ],
    });

    const result: any = await service.checkout(buyerId, baseDto() as any);

    expect(result.checkoutGroupId).toBe('group-existing');
    expect(result.existingGroup).toBe(true);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('idempotency key belonging to another buyer is rejected', async () => {
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue({
      id: 'group-existing',
      groupNumber: 'GRP-EXISTING',
      buyerId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      totalAmount: 250,
      orders: [],
    });

    await expect(service.checkout(buyerId, baseDto() as any)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('out-of-stock product aborts the whole checkout with the failing productId (atomicity)', async () => {
    mockTx.product.findMany.mockResolvedValue([
      makeProduct(productA),
      makeProduct(productB, { quantity: 1, reservedQuantity: 1 }), // müsait adet 0
    ]);

    let thrown: any;
    try {
      await service.checkout(buyerId, baseDto() as any);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect(thrown.getResponse()).toMatchObject({ productId: productB });
    expect(mockTx.checkoutGroup.create).not.toHaveBeenCalled();
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });

  it('cancels the buyer\'s stale pending order for the same product and releases its reservation', async () => {
    mockTx.order.findMany.mockResolvedValue([
      {
        id: 'stale-order-1',
        productId: productA,
        reservationReleasedAt: null,
      },
    ]);

    await service.checkout(buyerId, baseDto() as any);

    expect(mockTx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'stale-order-1' },
        data: expect.objectContaining({ status: OrderStatus.cancelled }),
      }),
    );
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: productA },
      data: { reservedQuantity: { decrement: 1 } },
    });
  });

  it('missing shipping address is rejected before any transaction', async () => {
    await expect(
      service.checkout(buyerId, {
        items: [{ productId: productA }],
        idempotencyKey,
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('guest checkout rejects coupon codes', async () => {
    // OTP tüketimi öncesi idempotensi: yeni anahtar → null
    mockPrisma.checkoutGroup.findUnique.mockResolvedValue(null);

    await expect(
      (service as any).createCheckoutGroup({
        buyerId,
        dto: { ...baseDto(), couponCode: 'INDIRIM10' },
        isGuest: true,
        guest: { email: 'g@test.com' },
      }),
    ).rejects.toThrow('Kupon kodu misafir alışverişte desteklenmiyor');
  });
});
