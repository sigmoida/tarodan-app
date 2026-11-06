import { Logger } from "@nestjs/common";
import { PayoutStatus, RefundAttemptStatus } from "@prisma/client";
import {
  PayoutProcessorWorld,
  buildPayoutProcessor,
} from "./testing/payout-processor-fixture";

/**
 * Sentry TARODAN-API-31..36 (8 payouts permanently failed): the transfer sent
 * `total_amount = order.totalAmount` although a refund had already lowered
 * what PayTR held for the merchant_oid, so PayTR answered err_no 010 ("toplam
 * transfer tutarı kalan tutardan fazla olamaz") on every attempt. The total is
 * now recomputed per attempt and persisted at claim time; a net that does not
 * fit goes to a manual decision without calling PayTR.
 */
describe("payout transfer total_amount", () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("single order without refund: total = order total, submerchant = net (pins today)", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 349);
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 349,
      holdAmount: 300,
      merchantOid: "ORD1",
      transId: "PYTSINGLE1",
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      merchantOid: "ORD1",
      transId: "PYTSINGLE1",
      totalAmount: 349,
      submerchantAmount: 300,
    });
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.completed,
      submittedTotalAmount: 349,
      submittedAmount: 300,
    });
  });

  it("partial refund 46 on a 349 order: total 303, net unchanged, total persisted", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 349, { refundedOrders: { o1: 46 } });
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 46,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 349,
      holdAmount: 300,
      holdRefunded: 40,
      merchantOid: "ORD1",
      transId: "PYTPARTIAL1",
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      totalAmount: 303,
      submerchantAmount: 260,
    });
    expect(world.payout("p1").submittedTotalAmount).toBe(303);
    // Runbook step 5: the log line shows the computed total.
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/PYTPARTIAL1.*total 303/),
    );
  });

  it("group oid: siblings share the payment minus refunds; a legacy sibling counts its amount", async () => {
    // Group payment 300 = A 100 + B 120 + C 80; B had 50 refunded.
    // C went out before this fix: completed, no submittedTotalAmount.
    const world = new PayoutProcessorWorld();
    world.addPayment("grp", 300, { refundedOrders: { oB: 50 } });
    world.refundAttempts.push({
      paymentId: "grp",
      orderId: "oB",
      tradeId: null,
      amount: 50,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "pA",
      paymentId: "grp",
      orderId: "oA",
      orderTotal: 100,
      holdAmount: 80,
      merchantOid: "GRP1",
      transId: "PYTGROUPA",
    });
    world.addOrderPayout({
      payoutId: "pB",
      paymentId: "grp",
      orderId: "oB",
      orderTotal: 120,
      holdAmount: 100,
      holdRefunded: 40,
      merchantOid: "GRP1",
      transId: "PYTGROUPB",
    });
    world.addOrderPayout({
      payoutId: "pC",
      paymentId: "grp",
      orderId: "oC",
      orderTotal: 80,
      holdAmount: 70,
      merchantOid: "GRP1",
      transId: "PYTGROUPC",
      status: PayoutStatus.completed,
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    const sent = createPlatformTransfer.mock.calls.map(([arg]) => [
      arg.transId,
      arg.totalAmount,
      arg.submerchantAmount,
    ]);
    // A: min(100, 300-50-80) = 100. B: min(70, 300-50-80-100) = 70.
    expect(sent).toEqual([
      ["PYTGROUPA", 100, 80],
      ["PYTGROUPB", 70, 60],
    ]);
    // Never more than the payment minus refunds leaves the oid.
    expect(100 + 70 + 80).toBeLessThanOrEqual(300 - 50);
  });

  describe("an installment cart (PSP scale, ADR 0019)", () => {
    // Plan 4.4: a 1,000.00 TL cart of two sellers paid in 3 installments,
    // C 1,066.38, F 66.38 split 39.83 / 26.55; seller nets 540 and 360 (10 %
    // commission), the same as paid in one.
    const cart = (
      refunds: Array<{ orderId: string; amount: number }> = [],
      refundedOrders: Record<string, number> = {},
    ) => {
      const world = new PayoutProcessorWorld();
      world.addPayment("grp", 1000, { refundedOrders }, 1066.38);
      for (const refund of refunds) {
        world.refundAttempts.push({
          paymentId: "grp",
          orderId: refund.orderId,
          tradeId: null,
          amount: refund.amount,
          status: RefundAttemptStatus.finalized,
        });
      }
      world.addOrderPayout({
        payoutId: "pBig",
        paymentId: "grp",
        orderId: "oBig",
        orderTotal: 600,
        orderFee: 39.83,
        holdAmount: 540,
        merchantOid: "GRPI1",
        transId: "PYTINSTBIG",
      });
      world.addOrderPayout({
        payoutId: "pSmall",
        paymentId: "grp",
        orderId: "oSmall",
        orderTotal: 400,
        orderFee: 26.55,
        holdAmount: 360,
        holdRefunded: refunds.length > 0 ? 144 : 0,
        merchantOid: "GRPI1",
        transId: "PYTINSTSMALL",
      });
      return world;
    };
    const sentOf = (
      calls: Array<
        [{ transId: string; totalAmount: number; submerchantAmount: number }]
      >,
    ) =>
      calls.map(([arg]) => [
        arg.transId,
        arg.totalAmount,
        arg.submerchantAmount,
      ]);

    it("sends each order's charged slice as total_amount; submerchant_amount stays the goods-scale net", async () => {
      const world = cart();
      const { service, createPlatformTransfer } = buildPayoutProcessor(world);

      await service.processPendingPayouts();

      expect(sentOf(createPlatformTransfer.mock.calls)).toEqual([
        ["PYTINSTBIG", 639.83, 540],
        ["PYTINSTSMALL", 426.55, 360],
      ]);
      // The two slices take exactly what PayTR charged for the oid.
      expect(639.83 + 426.55).toBeCloseTo(1066.38, 2);
    });

    it("AS-P5: each slice's margin (total - net) carries the order's fee share on top of the platform fees", async () => {
      const world = cart();
      const { service, createPlatformTransfer } = buildPayoutProcessor(world);

      await service.processPendingPayouts();

      const margins = createPlatformTransfer.mock.calls.map(
        ([arg]) =>
          Math.round((arg.totalAmount - arg.submerchantAmount) * 100) / 100,
      );
      // 600 - 540 = 60 of platform fees + 39.83; 400 - 360 = 40 + 26.55.
      expect(margins).toEqual([99.83, 66.55]);
    });

    it("a partial refund (160.00 of goods + 10.62 of fee) lowers the slice by the PSP refund", async () => {
      // 160.00 of goods refunded on the small order with 10.62 of vade farkı:
      // PayTR return_amount 170.62; the hold lost 144 (0.4 of 360).
      const world = cart([{ orderId: "oSmall", amount: 170.62 }], {
        oSmall: 160,
      });
      const { service, createPlatformTransfer } = buildPayoutProcessor(world);

      await service.processPendingPayouts();

      expect(sentOf(createPlatformTransfer.mock.calls)).toEqual([
        ["PYTINSTBIG", 639.83, 540],
        // 426.55 - 170.62 = 255.93 left for the slice; net 360 - 144 = 216.
        ["PYTINSTSMALL", 255.93, 216],
      ]);
    });
  });

  it("full refund with a residual of 40 and nothing left at PayTR: no call, manual decision, no seller e-mail", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 322, { refundedOrders: { o1: 322 } });
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 322,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 322,
      holdAmount: 100,
      holdRefunded: 60,
      merchantOid: "GRPXW1",
      transId: "PYTRESIDUAL1",
    });
    const { service, createPlatformTransfer, notification, ledger } =
      buildPayoutProcessor(world);

    const result = await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      submittedTotalAmount: null,
      providerResponse: {
        transferTotal: expect.objectContaining({
          allowedTotal: 0,
          ownAllowed: 0,
          oidRemaining: 0,
          net: 40,
        }),
      },
    });
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/p1.*PYTRESIDUAL1.*transfer_needs_manual_decision/),
    );
  });

  it("net above a positive allowed total: same manual decision, snapshot shows both", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 349);
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 334,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 349,
      holdAmount: 300,
      holdRefunded: 260,
      merchantOid: "ORD1",
      transId: "PYTOVER1",
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      providerResponse: {
        transferTotal: expect.objectContaining({ allowedTotal: 15, net: 40 }),
      },
    });
  });

  it("a manual-decision row requeued by an admin is recomputed and parks again without a PayTR call", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 322);
    world.refundAttempts.push({
      paymentId: "pay-1",
      orderId: "o1",
      tradeId: null,
      amount: 322,
      status: RefundAttemptStatus.finalized,
    });
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 322,
      holdAmount: 100,
      holdRefunded: 60,
      merchantOid: "ORD1",
      transId: "PYTREQUEUE1",
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);
    await service.processPendingPayouts();

    // Admin retry (admin-payout.service): failed -> pending, same trans_id.
    Object.assign(world.payout("p1"), {
      status: PayoutStatus.pending,
      failureReason: null,
      retryCount: 0,
    });
    await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      transId: "PYTREQUEUE1",
    });
  });

  it("trade cash payout uses the same total rule", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-t", 250);
    world.refundAttempts.push({
      paymentId: "pay-t",
      orderId: null,
      tradeId: "trade-1",
      amount: 25,
      status: RefundAttemptStatus.finalized,
    });
    world.addTradeCashPayout({
      payoutId: "pt",
      paymentId: "pay-t",
      tradeId: "trade-1",
      totalAmount: 250,
      net: 200,
      merchantOid: "TRADE1",
      transId: "PYTTRADE1",
    });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    expect(createPlatformTransfer.mock.calls[0][0]).toMatchObject({
      totalAmount: 225,
      submerchantAmount: 200,
    });
  });

  it("fails closed when the payout has no payment to cap against", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayout({ id: "orphan", merchantOid: "ORPHAN1" });
    const { service, createPlatformTransfer } = buildPayoutProcessor(world);

    await service.processPendingPayouts();

    // A data problem, not a residual to pay outside PayTR: the log says so.
    const logged = errorSpy.mock.calls.map(([m]) => String(m)).join("\n");
    expect(logged).toMatch(/orphan.*no payment/);
    expect(logged).not.toContain("does not fit");

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("orphan")).toMatchObject({
      status: PayoutStatus.failed,
      failureReason: "transfer_needs_manual_decision",
      providerResponse: {
        transferTotal: expect.objectContaining({
          missingInput: "payment",
          allowedTotal: 0,
        }),
      },
    });
  });

  it("releases the claim and the stamped total when the bank account changes during the claim", async () => {
    const world = new PayoutProcessorWorld();
    world.addPayment("pay-1", 349);
    world.addOrderPayout({
      payoutId: "p1",
      paymentId: "pay-1",
      orderId: "o1",
      orderTotal: 349,
      holdAmount: 300,
      merchantOid: "ORD1",
      transId: "PYTTOCTOU1",
    });
    const { service, prisma, createPlatformTransfer } =
      buildPayoutProcessor(world);
    const account = world.bankAccount;
    prisma.sellerBankAccount.findUnique
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ ...account, accountHolder: "Someone Else" });

    await service.processPendingPayouts();

    expect(createPlatformTransfer).not.toHaveBeenCalled();
    expect(world.payout("p1")).toMatchObject({
      status: PayoutStatus.pending,
      submittedTotalAmount: null,
    });
  });

  describe("a refund voids the payout while its total is computed", () => {
    /** Simulates the refund flow voiding the pending payout (K1) between the
     *  processor's read of the row and its write, as a concurrent request
     *  would: the row leaves `pending` while the refunds are being read. */
    function voidDuringTotal(
      world: PayoutProcessorWorld,
      prisma: ReturnType<typeof buildPayoutProcessor>["prisma"],
      payoutId: string,
    ) {
      prisma.refundAttempt.findMany.mockImplementationOnce(
        async ({ where }: { where: { paymentId?: string } }) => {
          Object.assign(world.payout(payoutId), {
            status: PayoutStatus.failed,
            failureReason: "order_refunded",
          });
          return world.refundAttempts.filter(
            (a) => a.paymentId === where.paymentId,
          );
        },
      );
    }

    it("a residual that does not fit is not parked over the voided row", async () => {
      const world = new PayoutProcessorWorld();
      world.addPayment("pay-1", 322, { refundedOrders: { o1: 322 } });
      world.refundAttempts.push({
        paymentId: "pay-1",
        orderId: "o1",
        tradeId: null,
        amount: 322,
        status: RefundAttemptStatus.finalized,
      });
      world.addOrderPayout({
        payoutId: "p1",
        paymentId: "pay-1",
        orderId: "o1",
        orderTotal: 322,
        holdAmount: 362,
        holdRefunded: 322,
        merchantOid: "ORDRACE1",
        transId: "PYTRACEPARK1",
      });
      const { service, prisma, createPlatformTransfer } =
        buildPayoutProcessor(world);
      voidDuringTotal(world, prisma, "p1");

      const result = await service.processPendingPayouts();

      expect(createPlatformTransfer).not.toHaveBeenCalled();
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "order_refunded",
        providerResponse: null,
      });
      expect(result.failed).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it("a total that fits is not claimed or sent for the voided row", async () => {
      const world = new PayoutProcessorWorld();
      world.addPayment("pay-1", 349);
      world.addOrderPayout({
        payoutId: "p1",
        paymentId: "pay-1",
        orderId: "o1",
        orderTotal: 349,
        holdAmount: 300,
        merchantOid: "ORDRACE2",
        transId: "PYTRACESEND1",
      });
      const { service, prisma, createPlatformTransfer } =
        buildPayoutProcessor(world);
      voidDuringTotal(world, prisma, "p1");

      await service.processPendingPayouts();

      expect(createPlatformTransfer).not.toHaveBeenCalled();
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "order_refunded",
        submittedTotalAmount: null,
      });
    });
  });
});
