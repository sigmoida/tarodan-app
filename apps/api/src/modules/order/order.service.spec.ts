import { Test, TestingModule } from '@nestjs/testing';
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
describe('OrderService createDirectOrder (1.6 idempotent Buy Now)', () => {
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
          reservedQuantity: 0,
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
    expect(second.existingOrder).toBe(true);
    expect(mockTx.order.findFirst).toHaveBeenCalledTimes(2);
    expect(mockTx.order.create).not.toHaveBeenCalled();
  });
});
