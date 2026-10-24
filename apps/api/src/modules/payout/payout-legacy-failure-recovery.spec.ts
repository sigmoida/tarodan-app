import { ConflictException, Logger } from "@nestjs/common";
import { PayoutStatus, RefundAttemptStatus } from "@prisma/client";
import { payoutResolutionFlags } from "./helpers/payout-resolution-policy";
import { PayoutResolutionService } from "./resolution/payout-resolution.service";
import {
  PayoutProcessorWorld,
  buildPayoutProcessor,
  type FixturePayout,
} from "./testing/payout-processor-fixture";

/**
 * Recovery of the 8 payouts that failed in production before the 2026-10-23
 * hotfix (Sentry TARODAN-API-30..36, docs/OPERATIONS.md "Recovery of the
 * payouts that failed before the 2026-10-23 hotfix"). Their rows were written
 * by the old failure handler, not by this code:
 * - a PayTR rejection: `failureReason` = PayTR's raw `err_msg`, PayTR's answer
 *   (`status: "error"`) in `providerResponse`, `retryCount` 3;
 * - a network error: `failureReason` = "Bad Request Exception" (the Nest
 *   default message), `providerResponse` null, `retryCount` 3;
 * - never a `submittedTotalAmount` (the column is new).
 *
 * Each shape is driven as the runbook does after the deploy: an admin retry,
 * then the next payout cron run. The expected end state is the runbook's
 * classification (send the recomputed total, or park for `external_bank`).
 *
 * The old handler resent the same trans_id up to 3 times and kept only the
 * LAST attempt's reason and answer, so an earlier attempt may have been a
 * network error that reached PayTR whatever the last answer says. Every
 * legacy row with more than one attempt therefore needs the PayTR panel
 * check before its retry, and again before it is paid from the bank.
 */

const PAYTR_010_TEXT = "toplam transfer tutarı kalan tutardan fazla olamaz";

/** A row as the pre-hotfix failure handler left it after PayTR's 010. */
const legacyRejection = (): Partial<FixturePayout> => ({
  failureReason: PAYTR_010_TEXT,
  retryCount: 3,
  providerResponse: {
    status: "error",
    err_no: "010",
    err_msg: PAYTR_010_TEXT,
  },
  submittedTotalAmount: null,
});

/** A row as the pre-hotfix failure handler left it after a thrown error. */
const legacyNetworkFailure = (): Partial<FixturePayout> => ({
  failureReason: "Bad Request Exception",
  retryCount: 3,
  providerResponse: null,
  submittedTotalAmount: null,
});

/** A sibling transfer on the same oid that went out before the hotfix. */
const legacyCompleted = (): Partial<FixturePayout> => ({
  status: PayoutStatus.completed,
  submittedTotalAmount: null,
});

/** The admin retry after the PayTR panel showed no transfer for the trans_id. */
const CHECKED = {
  actor: "admin-1",
  confirmProviderChecked: true,
  reason: "PayTR panel: no transfer with this trans_id",
};

function wire(world: PayoutProcessorWorld) {
  const built = buildPayoutProcessor(world);
  const resolution = new PayoutResolutionService(
    {
      ...built.prisma,
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ ...built.prisma }),
    } as never,
    {} as never,
    built.service,
  );
  return { ...built, resolution };
}

const failedSellerMails = (notification: {
  sendTemplateEmailToUser: jest.Mock;
}) =>
  notification.sendTemplateEmailToUser.mock.calls.filter(
    ([, template]) => template === "payout-failed-seller",
  );

describe("recovery of the payouts that failed before the 2026-10-23 hotfix", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("legacy PayTR rejections and network failures are recognised as such by the admin list", () => {
    // A rejection after 3 attempts: only the last answer is known, an
    // earlier attempt may have reached PayTR. Panel check first.
    expect(
      payoutResolutionFlags({
        status: PayoutStatus.failed,
        netAmount: 300,
        submittedAmount: null,
        submittedAt: null,
        ...legacyRejection(),
      } as never),
    ).toEqual({
      retryRequiresProviderCheck: true,
      markPaidMethod: "paytr_confirmed",
      markPaidNetAmount: 300,
      markPaidRequiresProviderCheck: false,
    });
    // A rejection on the only attempt: PayTR answered, nothing was taken.
    expect(
      payoutResolutionFlags({
        status: PayoutStatus.failed,
        netAmount: 300,
        submittedAmount: null,
        submittedAt: null,
        ...legacyRejection(),
        retryCount: 1,
      } as never),
    ).toEqual({
      retryRequiresProviderCheck: false,
      markPaidMethod: null,
      markPaidNetAmount: null,
      markPaidRequiresProviderCheck: false,
    });
    // A thrown error during a send attempt: PayTR may have it.
    expect(
      payoutResolutionFlags({
        status: PayoutStatus.failed,
        netAmount: 300,
        submittedAmount: null,
        submittedAt: null,
        ...legacyNetworkFailure(),
      } as never),
    ).toEqual({
      retryRequiresProviderCheck: true,
      markPaidMethod: "paytr_confirmed",
      markPaidNetAmount: 300,
      markPaidRequiresProviderCheck: false,
    });
  });

  it("remaining 303 (cart, refund on a sibling, sibling sent before the fix): the retry sends total 303", async () => {
    // Cart payment 500 = A 349 + B 151. B was paid out before the fix
    // (legacy: it sent its amount 151) and 46 was refunded on B later.
    // PayTR has 500 - 46 - 151 = 303 left for A.
    const world = new PayoutProcessorWorld();
    world.addPayment("grp", 500, { refundedOrders: { oB: 46 } });
    world.refundAttempts.push({
      paymentId: "grp",
      orderId: "oB",
      tradeId: null,
      amount: 46,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "pA",
      paymentId: "grp",
      orderId: "oA",
      orderTotal: 349,
      holdAmount: 300,
      merchantOid: "GRPTEST000002T000002",
      transId: "PYTTEST000002",
      status: PayoutStatus.failed,
      over: legacyRejection(),
    });
    world.addOrderPayout({
      payoutId: "pB",
      paymentId: "grp",
      orderId: "oB",
      orderTotal: 151,
      holdAmount: 140,
      merchantOid: "GRPTEST000002T000002",
      transId: "PYTSIBLINGB1",
      over: legacyCompleted(),
    });
    const { resolution, service, createPlatformTransfer, notification } =
      wire(world);

    await expect(
      resolution.retry("pA", { actor: "admin-1" }),
    ).rejects.toBeInstanceOf(ConflictException);
    await resolution.retry("pA", CHECKED);
    await service.processPendingPayouts();

    expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      merchantOid: "GRPTEST000002T000002",
      transId: "PYTTEST000002",
      totalAmount: 303,
      submerchantAmount: 300,
    });
    expect(world.payout("pA")).toMatchObject({
      status: PayoutStatus.completed,
      failureReason: null,
      submittedTotalAmount: 303,
      submittedAmount: 300,
    });
    expect(failedSellerMails(notification)).toHaveLength(0);
  });

  it.each([
    {
      shape: "the net fits",
      holdRefunded: 298,
      net: 12,
      sends: true,
    },
    {
      shape: "the net does not fit",
      holdRefunded: 270,
      net: 40,
      sends: false,
    },
  ])(
    "remaining 15 (cart, most of the order refunded, sibling sent before the fix): $shape",
    async ({ holdRefunded, net, sends }) => {
      // Cart payment 349 + 200. The sibling went out before the fix (200);
      // 334 of the 349 order was refunded: 549 - 334 - 200 = 15 left.
      const world = new PayoutProcessorWorld();
      world.addPayment("grp", 549, { refundedOrders: { oA: 334 } });
      world.refundAttempts.push({
        paymentId: "grp",
        orderId: "oA",
        tradeId: null,
        amount: 334,
        status: RefundAttemptStatus.finalized,
      });
      world.addOrderPayout({
        payoutId: "pA",
        paymentId: "grp",
        orderId: "oA",
        orderTotal: 349,
        holdAmount: 310,
        holdRefunded,
        merchantOid: "GRPTEST000001T000001",
        transId: "PYTTEST000004",
        status: PayoutStatus.failed,
        over: legacyRejection(),
      });
      world.addOrderPayout({
        payoutId: "pB",
        paymentId: "grp",
        orderId: "oB",
        orderTotal: 200,
        holdAmount: 180,
        merchantOid: "GRPTEST000001T000001",
        transId: "PYTSIBLINGB2",
        over: legacyCompleted(),
      });
      const { resolution, service, createPlatformTransfer, notification } =
        wire(world);

      await resolution.retry("pA", CHECKED);
      await service.processPendingPayouts();

      if (sends) {
        expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
        expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
          totalAmount: 15,
          submerchantAmount: net,
        });
        expect(world.payout("pA")).toMatchObject({
          status: PayoutStatus.completed,
          submittedTotalAmount: 15,
        });
      } else {
        expect(createPlatformTransfer).not.toHaveBeenCalled();
        const row = world.payout("pA");
        expect(row).toMatchObject({
          status: PayoutStatus.failed,
          failureReason: "transfer_needs_manual_decision",
          submittedTotalAmount: null,
          providerResponse: {
            transferTotal: expect.objectContaining({
              net,
              allowedTotal: 15,
              ownAllowed: 15,
              oidRemaining: 15,
            }),
          },
        });
        // Runbook step 6: the row now offers external_bank for the net,
        // after another PayTR panel check (an earlier send is unconfirmed).
        expect(payoutResolutionFlags(row as never)).toEqual({
          retryRequiresProviderCheck: false,
          markPaidMethod: "external_bank",
          markPaidNetAmount: net,
          markPaidRequiresProviderCheck: true,
        });
      }
      expect(failedSellerMails(notification)).toHaveLength(0);
    },
  );

  it("remaining 0 (full refund, the seller keeps a residual): the retry parks it for external_bank, no PayTR call, no e-mail", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("grp", 322, { refundedOrders: { oA: 322 } });
    world.refundAttempts.push({
      paymentId: "grp",
      orderId: "oA",
      tradeId: null,
      amount: 322,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "pA",
      paymentId: "grp",
      orderId: "oA",
      orderTotal: 322,
      holdAmount: 362,
      holdRefunded: 322,
      merchantOid: "GRPTEST000003T000003",
      transId: "PYTTEST000003",
      status: PayoutStatus.failed,
      over: legacyRejection(),
    });
    const { resolution, service, createPlatformTransfer, notification } =
      wire(world);

    await resolution.retry("pA", CHECKED);
    await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    const row = world.payout("pA");
    expect(row).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      transId: "PYTTEST000003",
      providerResponse: {
        transferTotal: expect.objectContaining({
          net: 40,
          allowedTotal: 0,
          oidRemaining: 0,
        }),
      },
    });
    expect(payoutResolutionFlags(row as never)).toEqual({
      retryRequiresProviderCheck: false,
      markPaidMethod: "external_bank",
      markPaidNetAmount: 40,
      markPaidRequiresProviderCheck: true,
    });
    expect(failedSellerMails(notification)).toHaveLength(0);
    // A second retry (e.g. a double click in the runbook) parks it again
    // without a PayTR call.
    await resolution.retry("pA", { actor: "admin-1" });
    await service.processPendingPayouts();
    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("pA").failureReason).toBe(
      "transfer_needs_manual_decision",
    );
  });

  it("cart over-allocation without a refund (orders sum above the payment): the retry sends what the oid has left", async () => {
    // Cart payment 280 although the orders total 300 (A 150 + B 150).
    // B went out before the fix with its amount 150: 130 is left for A.
    const world = new PayoutProcessorWorld();
    world.addPayment("grp", 280);
    world.addOrderPayout({
      payoutId: "pA",
      paymentId: "grp",
      orderId: "oA",
      orderTotal: 150,
      holdAmount: 120,
      merchantOid: "GRPOVERALLOC1",
      transId: "PYTOVERALLOCA",
      status: PayoutStatus.failed,
      over: legacyRejection(),
    });
    world.addOrderPayout({
      payoutId: "pB",
      paymentId: "grp",
      orderId: "oB",
      orderTotal: 150,
      holdAmount: 120,
      merchantOid: "GRPOVERALLOC1",
      transId: "PYTOVERALLOCB",
      over: legacyCompleted(),
    });
    const { resolution, service, createPlatformTransfer } = wire(world);

    await resolution.retry("pA", CHECKED);
    await service.processPendingPayouts();

    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      totalAmount: 130,
      submerchantAmount: 120,
    });
    expect(world.payout("pA").submittedTotalAmount).toBe(130);
  });

  describe("'Bad Request Exception' (a network error whose outcome nobody knows)", () => {
    const addRow = (world: PayoutProcessorWorld) => {
      world.addPayment("pay-1", 410);
      world.addOrderPayout({
        payoutId: "pE",
        paymentId: "pay-1",
        orderId: "oE",
        orderTotal: 410,
        holdAmount: 370,
        merchantOid: "ORDTEST000001",
        transId: "PYTTEST000001",
        status: PayoutStatus.failed,
        over: legacyNetworkFailure(),
      });
    };

    it("a plain retry is refused (409) and changes nothing", async () => {
      const world = new PayoutProcessorWorld();
      addRow(world);
      const { resolution, service, createPlatformTransfer } = wire(world);

      await expect(
        resolution.retry("pE", { actor: "admin-1" }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        resolution.retry("pE", {
          actor: "admin-1",
          confirmProviderChecked: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      await service.processPendingPayouts();

      expect(createPlatformTransfer).not.toHaveBeenCalled();
      expect(world.payout("pE")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "Bad Request Exception",
        retryCount: 3,
      });
    });

    it("after the PayTR panel check it is sent once with the same trans_id and the full total", async () => {
      const world = new PayoutProcessorWorld();
      addRow(world);
      const { resolution, service, createPlatformTransfer } = wire(world);

      const result = await resolution.retry("pE", {
        actor: "admin-1",
        confirmProviderChecked: true,
        reason: "PayTR panel lists no transfer PYTTEST000001",
      });
      await service.processPendingPayouts();

      expect(result).toMatchObject({
        transId: "PYTTEST000001",
        renewedTransId: false,
        providerCheckConfirmed: true,
      });
      expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
      expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
        transId: "PYTTEST000001",
        totalAmount: 410,
        submerchantAmount: 370,
      });
      expect(world.payout("pE")).toMatchObject({
        status: PayoutStatus.completed,
        submittedTotalAmount: 410,
      });
    });
  });
});
