import { Logger } from "@nestjs/common";
import { PaymentStatus, Prisma } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { INSTALLMENT_FEE_SPLIT_ORDER_BY } from "../installments/installment-pricing";

/**
 * Capture of a charge attempt (ADR 0019, plan 5.6 "Fulfillment"): the CAS
 * that completes the payment also writes the attempt's `chargeAttemptId`,
 * `chargedAmount`, `installmentFeeAmount` and `installmentCount` in ONE
 * update (the DB trigger checks them against the attempt), the attempt is
 * stamped `capturedAt` once, and F is split over the orders by largest
 * remainder in the keep guard's order.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

type Capture = { attemptId: string | null; feeAmount: Prisma.Decimal };
interface CapturePaths {
  claimPaymentCompleted(
    tx: unknown,
    payment: unknown,
    opts: {
      capturedMerchantOid?: string;
      providerData?: { installmentCount?: number };
    },
  ): Promise<Capture | null>;
  allocateCapturedFee(
    tx: unknown,
    capture: Capture,
    where: Record<string, unknown>,
  ): Promise<void>;
}

const ATTEMPT = {
  id: "att-3x",
  paymentId: "pay-1",
  merchantOid: "ORD1A",
  installmentCount: 3,
  baseAmount: D("1000.00"),
  installmentFeeAmount: D("66.38"),
  chargedAmount: D("1066.38"),
  capturedAt: null,
  cardFamily: "world",
  buyerSegment: "free",
  installmentRuleId: null,
};

function setup(
  opts: {
    attempt?: Record<string, unknown> | null;
    claimCount?: number;
    orders?: Array<{ id: string; totalAmount: Prisma.Decimal }>;
  } = {},
) {
  const tx = {
    paymentChargeAttempt: {
      findFirst: jest.fn(async () =>
        opts.attempt === undefined ? ATTEMPT : opts.attempt,
      ),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    payment: {
      updateMany: jest.fn(async (_args: unknown) => ({
        count: opts.claimCount ?? 1,
      })),
    },
    order: {
      findMany: jest.fn(async () => opts.orders ?? []),
      update: jest.fn(async () => ({})),
    },
  };
  const service = new PaymentFulfillmentService(
    ...(Array.from({ length: 12 }, () => ({})) as ConstructorParameters<
      typeof PaymentFulfillmentService
    >),
  );
  return { tx, paths: service as unknown as CapturePaths };
}

const payment = {
  id: "pay-1",
  amount: D("1000.00"),
  status: PaymentStatus.pending,
  metadata: {},
};

describe("PaymentFulfillmentService capture of a charge attempt", () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("writes the attempt's amounts and count in the completing update and stamps it once", async () => {
    const { tx, paths } = setup();

    const capture = await paths.claimPaymentCompleted(tx, payment, {
      capturedMerchantOid: "ORD1A",
      providerData: { installmentCount: 3 },
    });

    expect(capture).toEqual({ attemptId: "att-3x", feeAmount: D("66.38") });
    expect(tx.paymentChargeAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantOid: "ORD1A", paymentId: "pay-1" },
      }),
    );
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "pay-1",
        status: { in: [PaymentStatus.pending, PaymentStatus.processing] },
      },
      data: expect.objectContaining({
        status: PaymentStatus.completed,
        providerConversationId: "ORD1A",
        chargeAttemptId: "att-3x",
        chargedAmount: D("1066.38"),
        installmentFeeAmount: D("66.38"),
        installmentCount: 3,
      }),
    });
    expect(tx.paymentChargeAttempt.updateMany).toHaveBeenCalledWith({
      where: { id: "att-3x", capturedAt: null },
      data: { capturedAt: expect.any(Date) },
    });
  });

  it("completes with the signed count and logs a callback that reports another", async () => {
    const { tx, paths } = setup();

    await paths.claimPaymentCompleted(tx, payment, {
      capturedMerchantOid: "ORD1A",
      providerData: { installmentCount: 6 },
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ installmentCount: 3 }),
      }),
    );
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "INSTALLMENT_COUNT_MISMATCH payment=pay-1 oid=ORD1A: PayTR reported 6, the form was signed for 3",
      ),
    );
  });

  it("captures a single-payment attempt with C = T and no fee", async () => {
    const { tx, paths } = setup({
      attempt: {
        ...ATTEMPT,
        id: "att-1x",
        installmentCount: 1,
        installmentFeeAmount: D("0"),
        chargedAmount: D("1000.00"),
      },
    });

    const capture = await paths.claimPaymentCompleted(tx, payment, {
      capturedMerchantOid: "ORD1A",
      providerData: { installmentCount: 0 },
    });

    expect(capture).toEqual({ attemptId: "att-1x", feeAmount: D("0") });
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargeAttemptId: "att-1x",
          chargedAmount: D("1000.00"),
          installmentFeeAmount: D("0"),
          installmentCount: 1,
        }),
      }),
    );
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each`
    case                               | opts
    ${"no captured oid (dev bypass)"}  | ${{ capturedMerchantOid: undefined }}
    ${"an oid signed before attempts"} | ${{ capturedMerchantOid: "ORDOLD" }}
  `("stays a legacy capture with $case", async ({ opts }) => {
    const { tx, paths } = setup({ attempt: null });

    const capture = await paths.claimPaymentCompleted(tx, payment, opts);

    expect(capture).toEqual({ attemptId: null, feeAmount: D("0") });
    const data = (
      tx.payment.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    expect(data).not.toHaveProperty("chargeAttemptId");
    expect(data).not.toHaveProperty("chargedAmount");
    expect(tx.paymentChargeAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("does not link an attempt that is already captured", async () => {
    const { tx, paths } = setup({
      attempt: { ...ATTEMPT, capturedAt: new Date() },
    });
    const capture = await paths.claimPaymentCompleted(tx, payment, {
      capturedMerchantOid: "ORD1A",
    });
    expect(capture?.attemptId).toBeNull();
  });

  it("returns null and stamps nothing when the payment was already completed (duplicate callback)", async () => {
    const { tx, paths } = setup({ claimCount: 0 });
    expect(
      await paths.claimPaymentCompleted(tx, payment, {
        capturedMerchantOid: "ORD1A",
      }),
    ).toBeNull();
    expect(tx.paymentChargeAttempt.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to capture an installment attempt priced from another T (nothing written, alarm)", async () => {
    const { tx, paths } = setup();
    await expect(
      paths.claimPaymentCompleted(
        tx,
        { ...payment, amount: D("990.00") },
        { capturedMerchantOid: "ORD1A" },
      ),
    ).rejects.toThrow(
      "CHARGE_ATTEMPT_BASE_MISMATCH payment=pay-1 attempt=att-3x",
    );
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("capture refused, manual review"),
    );
  });

  it("captures a single attempt priced from another T without linking it (alarm)", async () => {
    const { tx, paths } = setup({
      attempt: {
        ...ATTEMPT,
        installmentCount: 1,
        installmentFeeAmount: D("0"),
        chargedAmount: D("1000.00"),
      },
    });
    const capture = await paths.claimPaymentCompleted(
      tx,
      { ...payment, amount: D("990.00") },
      { capturedMerchantOid: "ORD1A" },
    );
    expect(capture).toEqual({ attemptId: null, feeAmount: D("0") });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("captured without the attempt"),
    );
  });

  describe("fee allocation to the orders", () => {
    it("splits F over a two-seller cart by largest remainder in the keep guard's order (plan 4.4)", async () => {
      const { tx, paths } = setup({
        orders: [
          { id: "o-600", totalAmount: D("600.00") },
          { id: "o-400", totalAmount: D("400.00") },
        ],
      });

      await paths.allocateCapturedFee(
        tx,
        { attemptId: "att-3x", feeAmount: D("66.38") },
        { checkoutGroupId: "grp-1" },
      );

      expect(tx.order.findMany).toHaveBeenCalledWith({
        where: { checkoutGroupId: "grp-1" },
        select: { id: true, totalAmount: true },
        orderBy: INSTALLMENT_FEE_SPLIT_ORDER_BY,
      });
      expect(tx.order.update.mock.calls).toEqual([
        [
          {
            where: { id: "o-600" },
            data: { installmentFeeAmount: D("39.83") },
          },
        ],
        [
          {
            where: { id: "o-400" },
            data: { installmentFeeAmount: D("26.55") },
          },
        ],
      ]);
    });

    it("gives a single order the whole fee", async () => {
      const { tx, paths } = setup({
        orders: [{ id: "o-1", totalAmount: D("1000.00") }],
      });
      await paths.allocateCapturedFee(
        tx,
        { attemptId: "att-3x", feeAmount: D("66.38") },
        { id: "o-1" },
      );
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: "o-1" },
        data: { installmentFeeAmount: D("66.38") },
      });
    });

    it("sums exactly to F on an awkward three-way split", async () => {
      const { tx, paths } = setup({
        orders: [
          { id: "a", totalAmount: D("333.33") },
          { id: "b", totalAmount: D("333.33") },
          { id: "c", totalAmount: D("333.34") },
        ],
      });
      await paths.allocateCapturedFee(
        tx,
        { attemptId: "att", feeAmount: D("10.01") },
        { checkoutGroupId: "grp-1" },
      );
      const shares = tx.order.update.mock.calls.map(
        (call) =>
          (
            call as unknown as [
              { data: { installmentFeeAmount: Prisma.Decimal } },
            ]
          )[0].data.installmentFeeAmount,
      );
      expect(
        shares.reduce((sum, share) => sum.plus(share), D(0)).toFixed(2),
      ).toBe("10.01");
    });

    it("writes nothing without a fee (single payments, legacy captures)", async () => {
      const { tx, paths } = setup({
        orders: [{ id: "o-1", totalAmount: D("1000.00") }],
      });
      await paths.allocateCapturedFee(
        tx,
        { attemptId: null, feeAmount: D("0") },
        { id: "o-1" },
      );
      expect(tx.order.findMany).not.toHaveBeenCalled();
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it("fails the capture when a fee has no order to go to", async () => {
      const { tx, paths } = setup({ orders: [] });
      await expect(
        paths.allocateCapturedFee(
          tx,
          { attemptId: "att-3x", feeAmount: D("66.38") },
          { id: "missing" },
        ),
      ).rejects.toThrow("no order to allocate to");
    });
  });
});
