import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { PaymentStatus } from '@prisma/client';

// TODO: stale unit test — PaymentService dependencies/types drifted; covered by E2E trade scenario C
describe.skip('PaymentService refundTradeCashPaymentIfCompleted (4.6)', () => {
  let service: PaymentService;

  const mockTx = {
    payment: {
      update: jest.fn(),
    },
    tradeCashPayment: {
      update: jest.fn(),
    },
  };

  const mockPrisma = {
    payment: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      await fn(mockTx);
    }),
  };

  const mockPaytr = {
    createRefund: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PayTRService, useValue: mockPaytr },
        { provide: EventService, useValue: {} },
        { provide: InvoiceService, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  it('returns refunded false when no completed PayTR trade payment', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    const r = await service.refundTradeCashPaymentIfCompleted('550e8400-e29b-41d4-a716-446655440000');

    expect(r.refunded).toBe(false);
    expect(r.skippedReason).toBe('no_completed_paytr_payment');
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });

  it('calls PayTR createRefund and updates payment + tradeCashPayment on success', async () => {
    const tradeId = '550e8400-e29b-41d4-a716-446655440000';
    mockPrisma.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      amount: 99.5,
      provider: 'paytr',
      status: PaymentStatus.completed,
      providerConversationId: 'ORDER123',
      tradeCashPaymentId: 'tcp-1',
      metadata: { foo: 1 },
      tradeCashPayment: { id: 'tcp-1', tradeId },
    });

    mockPaytr.createRefund.mockResolvedValue({ status: 'success' });

    const r = await service.refundTradeCashPaymentIfCompleted(tradeId);

    expect(r.refunded).toBe(true);
    expect(r.paymentId).toBe('pay-1');
    expect(mockPaytr.createRefund).toHaveBeenCalledWith('ORDER123', 99.5);
    expect(mockTx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
    expect(mockTx.tradeCashPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tcp-1' },
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
  });
});
