import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';

describe('PaymentService reconcilePendingPaytrPayments (1.4)', () => {
  let service: PaymentService;

  const mockConfigGet = jest.fn((key: string): string | undefined => {
    if (key === 'PAYTR_RECONCILIATION_ENABLED') return undefined;
    if (key === 'PAYTR_RECONCILIATION_MIN_AGE_MINUTES') return '1';
    if (key === 'PAYTR_RECONCILIATION_BATCH_LIMIT') return '40';
    if (key === 'PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') return '0.05';
    return undefined;
  });

  const mockPrisma = {
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockPaytr = {
    queryPaymentStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn() } },
        { provide: ConfigService, useValue: { get: mockConfigGet } },
        { provide: PayTRService, useValue: mockPaytr },
        { provide: EventService, useValue: {} },
        { provide: InvoiceService, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it('returns zeros when PAYTR_RECONCILIATION_ENABLED is false', async () => {
    mockConfigGet.mockImplementation((key: string): string | undefined => {
      if (key === 'PAYTR_RECONCILIATION_ENABLED') return 'false';
      return undefined;
    });

    const result = await service.reconcilePendingPaytrPayments();

    expect(result).toEqual({ checked: 0, completed: 0 });
    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();

    mockConfigGet.mockImplementation((key: string): string | undefined => {
      if (key === 'PAYTR_RECONCILIATION_ENABLED') return undefined;
      if (key === 'PAYTR_RECONCILIATION_MIN_AGE_MINUTES') return '1';
      if (key === 'PAYTR_RECONCILIATION_BATCH_LIMIT') return '40';
      if (key === 'PAYTR_RECONCILE_AMOUNT_TOLERANCE_TL') return '0.05';
      return undefined;
    });
  });

  it('calls processSuccessfulPayment when PayTR reports success and amount matches', async () => {
    const oldCreated = new Date(Date.now() - 120_000);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        amount: 100,
        providerConversationId: 'T100',
        order: { id: 'o1', status: OrderStatus.pending_payment, totalAmount: 100 },
        createdAt: oldCreated,
      },
    ]);

    mockPaytr.queryPaymentStatus.mockResolvedValue({
      ok: true,
      paymentTotalTl: 100,
      paymentAmountTl: 100,
      currency: 'TL',
      paymentDate: '2024-01-01 12:00:00',
    });

    mockPrisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: PaymentStatus.pending,
      providerConversationId: 'T100',
      amount: 100,
      order: {
        id: 'o1',
        status: OrderStatus.pending_payment,
        buyer: {},
        seller: {},
        product: {},
      },
      tradeCashPayment: null,
    });

    const processSpy = jest.spyOn(service as any, 'processSuccessfulPayment').mockResolvedValue(true);

    const result = await service.reconcilePendingPaytrPayments();

    expect(result).toEqual({ checked: 1, completed: 1 });
    expect(mockPaytr.queryPaymentStatus).toHaveBeenCalledWith('T100');
    expect(processSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay-1' }),
      'paytr:T100:2024-01-01 12:00:00',
    );
  });

  it('does not complete when amount mismatches', async () => {
    const oldCreated = new Date(Date.now() - 120_000);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-2',
        amount: 100,
        providerConversationId: 'T200',
        order: { id: 'o2', status: OrderStatus.pending_payment },
        createdAt: oldCreated,
      },
    ]);
    mockPaytr.queryPaymentStatus.mockResolvedValue({
      ok: true,
      paymentTotalTl: 50,
      paymentAmountTl: 50,
      currency: 'TL',
    });

    const processSpy = jest.spyOn(service as any, 'processSuccessfulPayment').mockResolvedValue(true);

    const result = await service.reconcilePendingPaytrPayments();

    expect(result.completed).toBe(0);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('does not increment completed when processSuccessfulPayment returns false (race)', async () => {
    const oldCreated = new Date(Date.now() - 120_000);
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: 'pay-3',
        amount: 80,
        providerConversationId: 'T80',
        order: { id: 'o3', status: OrderStatus.pending_payment },
        createdAt: oldCreated,
      },
    ]);
    mockPaytr.queryPaymentStatus.mockResolvedValue({
      ok: true,
      paymentTotalTl: 80,
      paymentAmountTl: 80,
      currency: 'TL',
    });
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: 'pay-3',
      status: PaymentStatus.pending,
      order: { status: OrderStatus.pending_payment, buyer: {}, seller: {}, product: {} },
    });

    jest.spyOn(service as any, 'processSuccessfulPayment').mockResolvedValue(false);

    const result = await service.reconcilePendingPaytrPayments();

    expect(result.checked).toBe(1);
    expect(result.completed).toBe(0);
  });
});

describe('PaymentSchedulerService handleExpiredPayments order', () => {
  it('runs reconcile before release and cancel', async () => {
    const order: string[] = [];
    const paymentService = {
      reconcilePendingPaytrPayments: jest.fn().mockImplementation(async () => {
        order.push('reconcile');
        return { checked: 0, completed: 0 };
      }),
      releaseExpiredOrderReservations: jest.fn().mockImplementation(async () => {
        order.push('release');
        return { count: 0 };
      }),
      cancelExpiredPayments: jest.fn().mockImplementation(async () => {
        order.push('cancel');
        return { count: 0 };
      }),
    };

    const mockProductLockService = {
      sweepOutOfStockProducts: jest.fn().mockResolvedValue({
        productsScanned: 0,
        offersCancelled: 0,
        tradesCancelled: 0,
        rejectedOffers: [],
        cancelledTrades: [],
      }),
    };
    const mockEventService = {};

    const scheduler = new PaymentSchedulerService(
      paymentService as any,
      mockProductLockService as any,
      mockEventService as any,
    );
    await scheduler.handleExpiredPayments();

    expect(order).toEqual(['reconcile', 'release', 'cancel']);
  });
});
