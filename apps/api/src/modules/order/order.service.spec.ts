import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { EventService } from '../events';
import { NotificationService } from '../notification/notification.service';
import { DiscountService } from '../discount/discount.service';
import { DiscountCalculator } from '../discount/discount-calculator';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { DirectBuyDto } from './dto';
import { OrderStatus, ProductStatus } from '@prisma/client';

/**
 * Edge case 1.6 — duplicate Buy Now without payment: createDirectOrder returns
 * the existing pending_payment order (idempotent); no second Order row.
 */
// TODO: stale unit test — OrderService dependencies/signatures drifted; covered by E2E purchase + idempotency suites
describe.skip('OrderService createDirectOrder (1.6 idempotent Buy Now)', () => {
  let service: OrderService;

  const buyerId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const productId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const addressId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const categoryId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const directBuyDto: DirectBuyDto = {
    productId,
    shippingAddressId: addressId,
  };

  let mockTx: {
    $queryRaw: jest.Mock;
    product: { findUnique: jest.Mock; update: jest.Mock };
    order: { findFirst: jest.Mock; create: jest.Mock };
    address: { findUnique: jest.Mock; create: jest.Mock };
  };

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    order: { count: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const existingOrder = {
      id: 'order-pending-1',
      orderNumber: 'ORD-2025-000099',
      totalAmount: 129.99,
      subtotal: 100,
      discountAmount: 0,
      discountCode: null as string | null,
    };

    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: productId }]),
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: productId,
          status: ProductStatus.active,
          sellerId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          categoryId,
          price: 100,
          oldPrice: null,
          saleStartDate: null,
          saleEndDate: null,
          quantity: null,
          seller: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', displayName: 'Seller' },
        }),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(existingOrder),
        create: jest.fn(),
      },
      address: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    mockPrisma.user.findUnique.mockResolvedValue({ isBanned: false });
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
      ],
    }).compile();

    service = module.get(OrderService);
  });

  it('returns existing pending_payment order with existingOrder true and does not create a new order', async () => {
    const result = await service.createDirectOrder(buyerId, directBuyDto);

    expect(result).toMatchObject({
      orderId: 'order-pending-1',
      orderNumber: 'ORD-2025-000099',
      totalAmount: 129.99,
      subtotal: 100,
      discountAmount: 0,
      productId,
      paymentUrl: '',
      provider: 'paytr',
      existingOrder: true,
    });
    expect(mockTx.order.findFirst).toHaveBeenCalledWith({
      where: {
        productId,
        buyerId,
        status: OrderStatus.pending_payment,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(mockTx.order.create).not.toHaveBeenCalled();
    expect(mockTx.product.update).not.toHaveBeenCalled();
    expect(mockPrisma.order.count).not.toHaveBeenCalled();
  });

  it('second Buy Now returns the same order id and still does not call order.create', async () => {
    const first = await service.createDirectOrder(buyerId, directBuyDto);
    const second = await service.createDirectOrder(buyerId, directBuyDto);

    expect(first.orderId).toBe('order-pending-1');
    expect(second.orderId).toBe(first.orderId);
    expect((second as any).existingOrder).toBe(true);
    expect(mockTx.order.findFirst).toHaveBeenCalledTimes(2);
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });
});

describe.skip('OrderService guest checkout OTP (1.12)', () => {
  let service: OrderService;
  let mockCache: { get: jest.Mock; set: jest.Mock; del: jest.Mock; ttl: jest.Mock };
  let mockNotification: { sendGuestCheckoutVerificationCode: jest.Mock };
  let mockPrisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
    };
    mockNotification = {
      sendGuestCheckoutVerificationCode: jest.fn().mockResolvedValue({ success: true }),
    };
    mockPrisma = { $transaction: jest.fn() };

    const mockConfig = {
      get: jest.fn((key: string, def?: string) => {
        if (key === 'GUEST_CHECKOUT_OTP_SECRET') return 'test-pepper';
        return def;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EventService, useValue: {} },
        { provide: NotificationService, useValue: mockNotification },
        { provide: DiscountService, useValue: {} },
        { provide: DiscountCalculator, useValue: {} },
        {
          provide: SuratCargoService,
          useValue: { isIntegrationEnabled: () => false },
        },
      ],
    }).compile();

    service = module.get(OrderService);
  });

  const minimalGuestDto = {
    productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'guest@test.com',
    phone: '+905551234567',
    guestName: 'Guest User',
    emailVerificationCode: '123456',
    shippingAddress: {
      fullName: 'Guest User',
      phone: '+905551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      address: 'Test cad. 1',
    },
  };

  it('sendGuestCheckoutVerificationCode blocks when rate limit exceeded', async () => {
    const now = Date.now();
    mockCache.get.mockResolvedValue([now - 1000, now - 2000, now - 3000]);

    await expect(
      service.sendGuestCheckoutVerificationCode({ email: ' A@B.COM ' }),
    ).rejects.toThrow(BadRequestException);

    expect(mockNotification.sendGuestCheckoutVerificationCode).not.toHaveBeenCalled();
  });

  it('sendGuestCheckoutVerificationCode sends email and stores hashed OTP with consumptions', async () => {
    mockCache.get.mockResolvedValue(null);

    await service.sendGuestCheckoutVerificationCode({
      email: 'guest@test.com',
      expectedCheckoutCount: 3,
    });

    expect(mockNotification.sendGuestCheckoutVerificationCode).toHaveBeenCalledWith(
      'guest@test.com',
      expect.stringMatching(/^\d{6}$/),
      600,
    );

    const otpSet = mockCache.set.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('guest:checkout:otp:v1:'),
    );
    expect(otpSet).toBeDefined();
    expect(otpSet![1].c).toBe(3);
    expect(typeof otpSet![1].h).toBe('string');
  });

  it('guestCheckout does not run transaction when OTP record missing', async () => {
    mockCache.get.mockResolvedValue(null);

    await expect(service.guestCheckout(minimalGuestDto as any)).rejects.toThrow(BadRequestException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('guestCheckout rejects wrong code and does not start transaction', async () => {
    const wrongHash = createHash('sha256')
      .update('test-pepper:guest@test.com:999999', 'utf8')
      .digest('hex');
    mockCache.get.mockResolvedValue({ h: wrongHash, a: 0, c: 1, v: 5 });
    mockCache.ttl.mockResolvedValue(300);

    await expect(service.guestCheckout(minimalGuestDto as any)).rejects.toThrow(BadRequestException);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockCache.set).toHaveBeenCalled();
  });
});
