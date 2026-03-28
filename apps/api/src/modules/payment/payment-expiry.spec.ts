import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { OrderStatus, PaymentStatus, ProductStatus } from '@prisma/client';

/** Testlerde gerçek süreyi beklemeden eşik: env yoksa prod varsayılanı 30 dk; burada sabit 1 dk. */
const TEST_PAYMENT_TIMEOUT_MINUTES = '1';

describe('PaymentService expiry (1.3 — callback gelmeyen pending ödeme)', () => {
  let service: PaymentService;

  const mockConfigGet = jest.fn((key: string) => {
    if (key === 'PAYMENT_TIMEOUT_MINUTES') return TEST_PAYMENT_TIMEOUT_MINUTES;
    return undefined;
  });

  const mockPrisma = {
    payment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    product: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) {
        await op;
      }
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) {
        await op;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn().mockResolvedValue(undefined) } },
        { provide: ConfigService, useValue: { get: mockConfigGet } },
        { provide: PayTRService, useValue: {} },
        { provide: EventService, useValue: { emitPaymentFailed: jest.fn().mockResolvedValue(undefined) } },
        { provide: InvoiceService, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it('cancelExpiredPayments: süresi geçmiş pending ödemeyi failed yapar ve siparişi serbest bırakır', async () => {
    const oldCreated = new Date(Date.now() - 120_000);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-expired',
        orderId: 'order-1',
        amount: 100,
        currency: 'TRY',
        provider: 'paytr',
        createdAt: oldCreated,
        order: {
          orderNumber: 'T-100',
          buyerId: 'buyer-1',
          buyer: { email: 'b@test.com', displayName: 'Buyer' },
        },
      },
    ]);

    mockPrisma.order.findUnique.mockResolvedValue({
      status: OrderStatus.pending_payment,
      productId: 'prod-1',
    });
    mockPrisma.product.findUnique.mockResolvedValue({
      reservedQuantity: 1,
      status: ProductStatus.reserved,
    });

    const result = await service.cancelExpiredPayments();

    expect(result.count).toBe(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-expired' },
        data: expect.objectContaining({
          status: PaymentStatus.failed,
          failureReason: expect.stringContaining(TEST_PAYMENT_TIMEOUT_MINUTES),
        }),
      }),
    );
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: { status: OrderStatus.cancelled },
      }),
    );
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prod-1' },
        data: expect.objectContaining({
          reservedQuantity: 0,
          status: ProductStatus.active,
        }),
      }),
    );
  });

  it('releaseExpiredOrderReservations: teklifsiz pending_payment siparişi zaman aşımında iptal eder', async () => {
    mockPrisma.order.findMany.mockResolvedValue([
      { id: 'order-2', productId: 'prod-2', orderNumber: 'T-200' },
    ]);
    mockPrisma.product.findUnique.mockResolvedValue({
      reservedQuantity: 1,
      status: ProductStatus.reserved,
    });
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    const result = await service.releaseExpiredOrderReservations();

    expect(result.count).toBe(1);
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OrderStatus.pending_payment,
          offerId: null,
        }),
      }),
    );
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-2' },
        data: { status: OrderStatus.cancelled },
      }),
    );
  });
});
