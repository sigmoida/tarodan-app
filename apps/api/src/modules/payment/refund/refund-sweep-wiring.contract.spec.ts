import { Global, Module } from "@nestjs/common";
import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
  OPTIONAL_DEPS_METADATA,
  PARAMTYPES_METADATA,
} from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../../prisma";
import { PrismaModule } from "../../../prisma/prisma.module";
import { CacheModule } from "../../cache/cache.module";
import { CacheService } from "../../cache/cache.service";
import { UatProductionCopyModule } from "../../admin-test-tools/uat-refresh/uat-production-copy.module";
import { UatProductionCopyService } from "../../admin-test-tools/uat-refresh/uat-production-copy.service";
import { TradeModule } from "../../trade/trade.module";
import { TradeReconciliationService } from "../../trade/lifecycle/trade-reconciliation.service";
import { PaymentModule } from "../payment.module";
import { PaymentService } from "../payment.service";
import { PaymentReconciliationService } from "../reconciliation/payment-reconciliation.service";
import { ReservationReconciliationService } from "../reconciliation/reservation-reconciliation.service";
import { PaymentExpiryReconciliationService } from "../reconciliation/payment-expiry-reconciliation.service";
import { PspReconciliationService } from "../reconciliation/psp-reconciliation.service";
import { MiscReconciliationService } from "../reconciliation/misc-reconciliation.service";
import { PaymentRefundService } from "./payment-refund.service";
import { RefundReconciliationService } from "./refund-reconciliation.service";
import { RefundOrderSweepService } from "./refund-order-sweep.service";
import { RefundTradeSweepService } from "./refund-trade-sweep.service";

/**
 * CONTRACT (D1): the refund retry sweeps run from crons only, so broken
 * wiring would not fail a request; it would silently stop retrying refunds
 * (the buyer's money stays with us) or bring back the old, unthrottled
 * trade loop. This spec pins the chain against the real modules and classes:
 *
 *   trade cron -> TradeReconciliationService -> PaymentService
 *     -> PaymentReconciliationService -> RefundTradeSweepService
 *
 * and that both sweeps resolve their dependencies (the production-copy
 * guard from its leaf module, the cache and Prisma from global modules).
 */
describe("Refund retry sweeps wiring", () => {
  const SWEEP_DEPENDENCIES = [
    PrismaService,
    PaymentRefundService,
    CacheService,
    UatProductionCopyService,
  ];

  it.each([RefundOrderSweepService, RefundTradeSweepService])(
    "%p injects Prisma, the refund service, the cache and the copy guard, none optional",
    (sweep) => {
      expect(Reflect.getMetadata(PARAMTYPES_METADATA, sweep)).toEqual(
        SWEEP_DEPENDENCIES,
      );
      expect(Reflect.getMetadata(OPTIONAL_DEPS_METADATA, sweep) ?? []).toEqual(
        [],
      );
    },
  );

  it("PaymentModule provides both sweeps and the guard's module; the trade module reaches PaymentService", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PaymentModule,
    );
    expect(providers).toEqual(
      expect.arrayContaining([
        RefundOrderSweepService,
        RefundTradeSweepService,
        PaymentReconciliationService,
        PaymentService,
      ]),
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, PaymentModule),
    ).toContain(UatProductionCopyModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, UatProductionCopyModule),
    ).toContain(UatProductionCopyService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, PaymentModule),
    ).toContain(PaymentService);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, TradeModule)).toContain(
      PaymentModule,
    );
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, CacheModule)).toBe(true);
    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, PrismaModule)).toBe(
      true,
    );
  });

  it("the trade cron's call reaches the trade refund sweep through the real Nest container", async () => {
    const prisma = {
      // Not live production under jest: the copy guard reads the runs.
      uatRefreshRun: { findMany: jest.fn().mockResolvedValue([]) },
      refundAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      trade: { findMany: jest.fn().mockResolvedValue([{ id: "trade-1" }]) },
    };
    const cache = {
      claimKey: jest.fn().mockResolvedValue("claimed"),
      exists: jest.fn().mockResolvedValue(false),
      setIfAbsent: jest.fn().mockResolvedValue(true),
    };
    const paymentRefund = {
      refundTradeCashTracked: jest
        .fn()
        .mockResolvedValue({ refunded: true, failed: false }),
    };

    // Stand-ins for the two global modules (PrismaModule, CacheModule).
    @Global()
    @Module({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
      exports: [PrismaService, CacheService],
    })
    class GlobalStandIns {}

    const moduleRef = await Test.createTestingModule({
      imports: [GlobalStandIns, UatProductionCopyModule],
      providers: [
        PaymentReconciliationService,
        RefundOrderSweepService,
        RefundTradeSweepService,
        { provide: PaymentRefundService, useValue: paymentRefund },
        { provide: ReservationReconciliationService, useValue: {} },
        { provide: PaymentExpiryReconciliationService, useValue: {} },
        { provide: PspReconciliationService, useValue: {} },
        { provide: RefundReconciliationService, useValue: {} },
        { provide: MiscReconciliationService, useValue: {} },
      ],
    }).compile();

    // PaymentService and TradeReconciliation are thin delegates with large
    // constructors: their real methods run on the real reconciliation facade.
    const paymentService: unknown = Object.assign(
      Object.create(PaymentService.prototype),
      { paymentReconciliation: moduleRef.get(PaymentReconciliationService) },
    );
    const tradeReconciliation = Object.assign(
      Object.create(TradeReconciliationService.prototype),
      { paymentService },
    ) as TradeReconciliationService;

    await expect(
      tradeReconciliation.retryFailedTradeRefunds(),
    ).resolves.toEqual({ retried: 1, recovered: 1 });
    // The D1 sweep ran: its candidate query, then the retry as a caller that
    // raises its own alarm (no payer push per retry).
    expect(prisma.trade.findMany).toHaveBeenCalledTimes(1);
    expect(paymentRefund.refundTradeCashTracked).toHaveBeenCalledWith(
      "trade-1",
      { callerAlarms: true },
    );

    await moduleRef.close();
  });
});
