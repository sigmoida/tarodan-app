import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma';
import { CacheService } from '../cache/cache.service';
import { PayTRService } from '../payment-providers/paytr.service';
import { EventService } from '../events';
import { InvoiceService } from '../invoice/invoice.service';
import { ProductLockService } from '../product/product-lock.service';
import { NotificationService } from '../notification/notification.service';
import { SuratCargoService } from '../surat-cargo/surat-cargo.service';
import { CommissionLedgerService } from '../commission/commission-ledger.service';
import { StorageService } from '../storage/storage.service';
import { PaymentStatus } from '@prisma/client';

/**
 * B3: PayTR çift-iade koruması. refundInProgressAt marker'ı PayTR çağrısından önce
 * yazılır; marker zaten varsa (önceki denemede PayTR çağrılmış ama persist başarısız
 * olmuş) PayTR tekrar çağrılmaz, yalnız persist-recovery denenir.
 */
describe('PaymentService refundTradeCashPaymentIfCompleted — B3 çift-iade koruması', () => {
  let service: PaymentService;

  const mockTx = {
    payment: { update: jest.fn() },
    tradeCashPayment: { update: jest.fn() },
  };

  const mockPrisma = {
    payment: { findFirst: jest.fn(), update: jest.fn() },
    payoutTransfer: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      await fn(mockTx);
    }),
  };

  const mockPaytr = { createRefund: jest.fn() };

  const TRADE_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.payoutTransfer.findFirst.mockResolvedValue(null);

    const noop = {} as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: { del: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: PayTRService, useValue: mockPaytr },
        { provide: EventService, useValue: noop },
        { provide: InvoiceService, useValue: noop },
        { provide: ProductLockService, useValue: noop },
        { provide: NotificationService, useValue: noop },
        { provide: SuratCargoService, useValue: noop },
        { provide: CommissionLedgerService, useValue: noop },
        { provide: StorageService, useValue: noop },
        { provide: ModuleRef, useValue: noop },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  const basePayment = (metadata: Record<string, unknown>) => ({
    id: 'pay-1',
    amount: 99.5,
    provider: 'paytr',
    status: PaymentStatus.completed,
    providerConversationId: 'ORDER123',
    tradeCashPaymentId: 'tcp-1',
    metadata,
    tradeCashPayment: { id: 'tcp-1', tradeId: TRADE_ID, totalAmount: 99.5 },
  });

  it('marker yokken: önce marker yazar, sonra PayTR iadesini çağırır', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPaytr.createRefund.mockResolvedValue({ status: 'success' });

    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(r.refunded).toBe(true);
    // marker, PayTR çağrısından önce kalıcı yazılmalı (prisma.payment.update, tx dışı)
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            refundInProgressAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(mockPaytr.createRefund).toHaveBeenCalledWith('ORDER123', 99.5);
  });

  it('marker varken: PayTR tekrar ÇAĞRILMAZ, yalnız persist-recovery denenir', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(
      basePayment({ refundInProgressAt: '2026-06-29T00:00:00.000Z' }),
    );

    const r = await service.refundTradeCashPaymentIfCompleted(TRADE_ID);

    expect(r.refunded).toBe(true);
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
    // recovery: refundedAt persist edilmeli
    expect(mockTx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.refunded }),
      }),
    );
  });

  it('marker yazımı başarısızsa PayTR çağrılmadan abort eder', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(basePayment({ foo: 1 }));
    mockPrisma.payment.update.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.refundTradeCashPaymentIfCompleted(TRADE_ID),
    ).rejects.toThrow();
    expect(mockPaytr.createRefund).not.toHaveBeenCalled();
  });
});
