import { Prisma } from "@prisma/client";
import { TestLaneService } from "../../src/modules/admin-test-tools/test-lane.service";
import type { PrismaService } from "../../src/prisma";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import {
  createChargeAttempt,
  createGroupOrder,
  createGroupPayment,
  createInstallmentRule,
  createRateSnapshot,
} from "../factories/installment.factory";

/**
 * DB-level guarantees of the installment schema (ADR 0019; migrations
 * 20261103120000_installment_payments_schema and
 * 20261103120100_installment_payments_validate_constraints).
 *
 * Pure data-layer test: no app boot, Prisma and raw SQL only. The schema must
 * be inert for today's code (legacy rows and writes keep working) and refuse
 * every write that would break a money invariant once A4 starts writing.
 */
describe("installment schema DB guarantees (E2E)", () => {
  const prisma = getPrisma();
  const d = (value: string) => new Prisma.Decimal(value);

  afterAll(async () => {
    await disconnectPrisma();
  });

  /** Runs `fn` with the test-lane purge gate open, as `resetLane` does. */
  const withPurgeGate = <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.test_lane_purge = 'on'`);
      return fn(tx);
    });

  describe("migration state", () => {
    it.each([
      "payments_charged_amount_check",
      "payments_installment_fee_amount_check",
      "payments_charge_attempt_id_fkey",
      "orders_installment_fee_amount_check",
      "refund_attempts_installment_fee_amount_check",
    ])("%s is validated", async (constraint) => {
      const rows = await prisma.$queryRaw<Array<{ convalidated: boolean }>>`
        SELECT convalidated FROM pg_constraint WHERE conname = ${constraint}`;
      expect(rows).toEqual([{ convalidated: true }]);
    });

    it("adds the ledger accounts and the invoice type", async () => {
      const rows = await prisma.$queryRaw<Array<{ label: string }>>`
        SELECT e.enumlabel AS label FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE (t.typname = 'LedgerAccount'
               AND e.enumlabel IN ('installment_fee', 'installment_platform_cost'))
           OR (t.typname = 'ElogoInvoiceType' AND e.enumlabel = 'buyer_installment_fee')
        ORDER BY 1`;
      expect(rows.map((r) => r.label)).toEqual([
        "buyer_installment_fee",
        "installment_fee",
        "installment_platform_cost",
      ]);
    });

    it("books the new ledger accounts like any other (append-only stays)", async () => {
      const entry = await prisma.ledgerEntry.create({
        data: {
          entryGroupId: `grp-installment-${Math.random().toString(36).slice(2)}`,
          eventType: "payment_captured",
          account: "installment_fee",
          direction: "credit",
          amount: d("66.38"),
        },
      });
      await expect(
        prisma.ledgerEntry.update({
          where: { id: entry.id },
          data: { account: "installment_platform_cost" },
        }),
      ).rejects.toThrow(/append-only/i);
    });
  });

  describe("payments (legacy rows and today's writes)", () => {
    it("defaults a new payment to fee 0 and no charged amount", async () => {
      const { paymentId } = await createGroupPayment();
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.installmentFeeAmount.toFixed(2)).toBe("0.00");
      expect(payment.chargedAmount).toBeNull();
      expect(payment.chargeAttemptId).toBeNull();
    });

    it("keeps the retry path working: the amount of a legacy payment can be reset", async () => {
      // payment-initiation.service.ts resets `amount` on a non-completed
      // payment; with charged_amount NULL the CHECK must not get in the way.
      const { paymentId } = await createGroupPayment();
      await prisma.payment.update({
        where: { id: paymentId },
        data: { amount: d("1200.00"), status: "pending" },
      });
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.amount.toFixed(2)).toBe("1200.00");
    });

    it("refuses a charged amount that is not amount + fee", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: { chargedAmount: d("1066.38") },
        }),
      ).rejects.toThrow(/payments_charged_amount_check/);
    });

    it("refuses a negative fee", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            installmentFeeAmount: d("-1.00"),
            chargedAmount: d("999.00"),
          },
        }),
      ).rejects.toThrow(
        /payments_(charged_amount|installment_fee_amount)_check/,
      );
    });

    it("refuses a fee without a charged amount (chargedAmountOf would read T)", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: { installmentFeeAmount: d("66.38") },
        }),
      ).rejects.toThrow(/payments_charged_amount_check/);
    });

    it("refuses a fee that no charge attempt priced", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            installmentFeeAmount: d("66.38"),
            chargedAmount: d("1066.38"),
          },
        }),
      ).rejects.toThrow(/payments_charged_amount_check/);
    });

    it("accepts a charged amount equal to the goods total without an attempt", async () => {
      // A single payment captured without an attempt (e.g. a form signed
      // before the installment code): C = T, no fee.
      const { paymentId } = await createGroupPayment();
      const payment = await prisma.payment.update({
        where: { id: paymentId },
        data: { chargedAmount: d("1000.00") },
      });
      expect(payment.chargedAmount?.toFixed(2)).toBe("1000.00");
    });
  });

  describe("payment_charge_attempts", () => {
    it("stores a priced installment attempt and a single-payment attempt", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const installment = await createChargeAttempt(paymentId, snapshot.id);
      const single = await createChargeAttempt(paymentId, null, {
        installmentCount: 1,
        installmentFeeAmount: d("0"),
        chargedAmount: d("1000.00"),
        singleRatePct: null,
        installmentRatePct: null,
        cardFamily: null,
      });
      expect(installment.chargedAmount.toFixed(2)).toBe("1066.38");
      expect(single.platformCostAmount.toFixed(2)).toBe("0.00");
    });

    it("refuses an attempt for another PayTR store than its payment's", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(
        createChargeAttempt(paymentId, null, {
          paytrMerchant: "membership",
          installmentCount: 1,
          installmentFeeAmount: d("0"),
          chargedAmount: d("1000.00"),
        }),
      ).rejects.toThrow(/differs from the store of payment/);
    });

    it("refuses a rate snapshot of another PayTR store", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot({
        paytrMerchant: "membership",
      });
      await expect(createChargeAttempt(paymentId, snapshot.id)).rejects.toThrow(
        /belongs to another store/,
      );
    });

    it("keeps merchant_oid unique", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const first = await createChargeAttempt(paymentId, snapshot.id);
      await expect(
        createChargeAttempt(paymentId, snapshot.id, {
          merchantOid: first.merchantOid,
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it.each<
      [string, Partial<Prisma.PaymentChargeAttemptUncheckedCreateInput>, RegExp]
    >([
      [
        "C != T + F",
        { chargedAmount: d("1066.39") },
        /payment_charge_attempts_amounts_check/,
      ],
      [
        "a negative fee",
        { installmentFeeAmount: d("-1.00"), chargedAmount: d("999.00") },
        /payment_charge_attempts_amounts_check/,
      ],
      [
        "a zero goods total",
        {
          baseAmount: d("0"),
          installmentFeeAmount: d("0"),
          chargedAmount: d("0"),
        },
        /payment_charge_attempts_amounts_check/,
      ],
      [
        "a negative platform cost",
        { platformCostAmount: d("-0.01") },
        /payment_charge_attempts_amounts_check/,
      ],
      [
        "13 installments",
        { installmentCount: 13 },
        /payment_charge_attempts_installment_count_check/,
      ],
      [
        "0 installments",
        { installmentCount: 0 },
        /payment_charge_attempts_installment_count_check/,
      ],
      [
        "a single payment with a fee",
        { installmentCount: 1 },
        /payment_charge_attempts_single_check/,
      ],
      [
        "a share without a rule",
        { platformSharePct: d("50.00") },
        /payment_charge_attempts_rule_share_check/,
      ],
      [
        "a share above 100",
        { platformSharePct: d("100.01") },
        /payment_charge_attempts_pct_check/,
      ],
      [
        "a rate of 100 or more",
        { installmentRatePct: d("100.000") },
        /payment_charge_attempts_pct_check/,
      ],
      [
        "8 BIN digits",
        { bin6: "45678901" },
        /payment_charge_attempts_bin6_check/,
      ],
      [
        "non-digit BIN",
        { bin6: "4567ab" },
        /payment_charge_attempts_bin6_check/,
      ],
      [
        "an installment without a card family",
        { cardFamily: null },
        /payment_charge_attempts_installment_pricing_check/,
      ],
    ])("refuses %s", async (_label, overrides, error) => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      await expect(
        createChargeAttempt(paymentId, snapshot.id, overrides),
      ).rejects.toThrow(error);
    });

    it("refuses an installment attempt without a rate snapshot", async () => {
      const { paymentId } = await createGroupPayment();
      await expect(createChargeAttempt(paymentId, null)).rejects.toThrow(
        /payment_charge_attempts_installment_pricing_check/,
      );
    });

    it("freezes the pricing snapshot and stamps capturedAt once", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const attempt = await createChargeAttempt(paymentId, snapshot.id, {
        bin6: "435508",
      });

      await expect(
        prisma.paymentChargeAttempt.update({
          where: { id: attempt.id },
          data: { installmentRatePct: d("7.000") },
        }),
      ).rejects.toThrow(/pricing snapshot of attempt .* is immutable/);
      await expect(
        prisma.paymentChargeAttempt.update({
          where: { id: attempt.id },
          data: { buyerSegment: "premium" },
        }),
      ).rejects.toThrow(/is immutable/);

      const capturedAt = new Date("2026-11-03T10:00:00Z");
      await prisma.paymentChargeAttempt.update({
        where: { id: attempt.id },
        data: { capturedAt },
      });
      await expect(
        prisma.paymentChargeAttempt.update({
          where: { id: attempt.id },
          data: { capturedAt: new Date("2026-11-03T11:00:00Z") },
        }),
      ).rejects.toThrow(/already captured/);
      // Re-writing the same stamp (an idempotent replay) is not a change.
      await prisma.paymentChargeAttempt.update({
        where: { id: attempt.id },
        data: { capturedAt },
      });
    });

    // Every change below keeps the row's own CHECKs satisfied, so only the
    // guard trigger can refuse it. The callback, the inquiry and the
    // statement match compare PayTR's amount with this row: a C, T, F, store,
    // oid or payment that moves after signing breaks that comparison.
    it.each<[string, Prisma.PaymentChargeAttemptUncheckedUpdateInput]>([
      [
        "goods total and charged amount (C = T + F still holds)",
        { baseAmount: d("1001.00"), chargedAmount: d("1067.38") },
      ],
      [
        "fee and charged amount (C = T + F still holds)",
        { installmentFeeAmount: d("70.00"), chargedAmount: d("1070.00") },
      ],
      ["installment count", { installmentCount: 6 }],
      ["platform cost", { platformCostAmount: d("12.34") }],
      ["fee VAT rate", { feeVatRatePct: d("10.00") }],
      ["merchant oid", { merchantOid: "TG-REWRITTEN" }],
      ["card family", { cardFamily: "bonus" }],
      ["BIN", { bin6: "540061" }],
    ])("freezes the attempt's %s", async (_label, data) => {
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
        { bin6: "435508" },
      );
      await expect(
        prisma.paymentChargeAttempt.update({ where: { id: attempt.id }, data }),
      ).rejects.toThrow(/pricing snapshot of attempt .* is immutable/);
    });

    it("freezes the attempt's payment, store, rule and rate snapshot", async () => {
      const { paymentId } = await createGroupPayment();
      const other = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const attempt = await createChargeAttempt(paymentId, snapshot.id);
      const rule = await createInstallmentRule();
      const freshSnapshot = await createRateSnapshot();

      for (const data of [
        { paymentId: other.paymentId },
        { paytrMerchant: "membership" as const },
        { installmentRuleId: rule.id, platformSharePct: d("100.00") },
        { rateSnapshotId: freshSnapshot.id },
      ] satisfies Prisma.PaymentChargeAttemptUncheckedUpdateInput[]) {
        await expect(
          prisma.paymentChargeAttempt.update({
            where: { id: attempt.id },
            data,
          }),
        ).rejects.toThrow(/pricing snapshot of attempt .* is immutable/);
      }
    });

    it("refuses DELETE, also through the purge gate for a live payment", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const attempt = await createChargeAttempt(paymentId, snapshot.id);

      await expect(
        prisma.paymentChargeAttempt.delete({ where: { id: attempt.id } }),
      ).rejects.toThrow(/financial evidence, DELETE refused/);
      await expect(
        withPurgeGate((tx) =>
          tx.paymentChargeAttempt.delete({ where: { id: attempt.id } }),
        ),
      ).rejects.toThrow(/financial evidence, DELETE refused/);
    });

    it("keeps the payment (Restrict) while it has attempts", async () => {
      const { paymentId } = await createGroupPayment();
      await createChargeAttempt(paymentId, (await createRateSnapshot()).id);
      await expect(
        prisma.payment.delete({ where: { id: paymentId } }),
      ).rejects.toMatchObject({
        code: "P2003",
        meta: {
          field_name: expect.stringContaining("payment_charge_attempts"),
        },
      });
    });
  });

  describe("payments -> captured attempt", () => {
    const capture = (
      paymentId: string,
      attempt: {
        id: string;
        chargedAmount: Prisma.Decimal;
        installmentFeeAmount: Prisma.Decimal;
      },
      client: Prisma.TransactionClient = prisma,
    ) =>
      client.payment.update({
        where: { id: paymentId },
        data: {
          status: "completed",
          chargeAttemptId: attempt.id,
          chargedAmount: attempt.chargedAmount,
          installmentFeeAmount: attempt.installmentFeeAmount,
          installmentCount: 3,
        },
      });

    it("captures through one of its own attempts with matching amounts", async () => {
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await capture(paymentId, attempt);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.chargedAmount?.toFixed(2)).toBe("1066.38");
      expect(payment.installmentFeeAmount.toFixed(2)).toBe("66.38");
    });

    it("refuses a capture whose installment count differs from the attempt", async () => {
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            chargeAttemptId: attempt.id,
            chargedAmount: attempt.chargedAmount,
            installmentFeeAmount: attempt.installmentFeeAmount,
            installmentCount: 1,
          },
        }),
      ).rejects.toThrow(/does not match charge attempt/);
    });

    it("refuses a new payment row that claims another payment's attempt", async () => {
      const owner = await createGroupPayment();
      const attempt = await createChargeAttempt(
        owner.paymentId,
        (await createRateSnapshot()).id,
      );
      const other = await createGroupPayment();
      // A second payment for the same cart cannot exist (unique group), so
      // the intruder is a fresh group of the other buyer.
      const intruderGroup = await prisma.checkoutGroup.create({
        data: {
          groupNumber: `TG-INTRUDER-${Math.random().toString(36).slice(2)}`,
          buyerId: other.buyerId,
          totalAmount: d("1000.00"),
        },
      });
      await expect(
        prisma.payment.create({
          data: {
            checkoutGroupId: intruderGroup.id,
            provider: "paytr",
            amount: d("1000.00"),
            installmentCount: 3,
            chargeAttemptId: attempt.id,
            chargedAmount: attempt.chargedAmount,
            installmentFeeAmount: attempt.installmentFeeAmount,
          },
        }),
      ).rejects.toThrow(/does not match charge attempt/);
    });

    it("refuses another payment's attempt", async () => {
      const a = await createGroupPayment();
      const b = await createGroupPayment();
      const attemptOfB = await createChargeAttempt(
        b.paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(capture(a.paymentId, attemptOfB)).rejects.toThrow(
        /does not match charge attempt/,
      );
    });

    it("refuses a charged amount or fee that differs from the attempt", async () => {
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: { chargeAttemptId: attempt.id },
        }),
      ).rejects.toThrow(/does not match charge attempt/);
    });

    it("refuses an attempt priced from another goods total (via the CHECK)", async () => {
      const { paymentId } = await createGroupPayment({ amount: "900.00" });
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(capture(paymentId, attempt)).rejects.toThrow(
        /payments_charged_amount_check/,
      );
    });

    // The two cases below satisfy `payments_charged_amount_check` (C = T + F
    // on the payment row), so only the trigger's own comparison with the
    // attempt can refuse them: PayTR charged the attempt's C, not the
    // payment's.
    it("refuses a charged amount other than the attempt's, even when C = T + F holds on the payment", async () => {
      const { paymentId } = await createGroupPayment({ amount: "900.00" });
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            chargeAttemptId: attempt.id,
            chargedAmount: d("966.38"),
            installmentFeeAmount: attempt.installmentFeeAmount,
            installmentCount: 3,
          },
        }),
      ).rejects.toThrow(/does not match charge attempt/);
    });

    it("refuses a fee other than the attempt's, even when the charged amounts match", async () => {
      const { paymentId } = await createGroupPayment({ amount: "1010.00" });
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: {
            chargeAttemptId: attempt.id,
            chargedAmount: attempt.chargedAmount,
            installmentFeeAmount: d("56.38"),
            installmentCount: 3,
          },
        }),
      ).rejects.toThrow(/does not match charge attempt/);
    });

    it("refuses a capture after the payment moved to another PayTR store", async () => {
      // The attempt's store is checked at INSERT; the payment's store can
      // still change while it is uncaptured, so the capture checks it again.
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await prisma.payment.update({
        where: { id: paymentId },
        data: { paytrMerchant: "membership" },
      });
      await expect(capture(paymentId, attempt)).rejects.toThrow(
        /does not match charge attempt/,
      );
    });

    it.each<[string, Prisma.PaymentUncheckedUpdateInput, RegExp]>([
      [
        "the installment count",
        { installmentCount: 6 },
        /does not match charge attempt/,
      ],
      [
        "the PayTR store",
        { paytrMerchant: "membership" },
        /does not match charge attempt/,
      ],
      [
        "the fee and charged amount together (C = T + F still holds)",
        { installmentFeeAmount: d("66.37"), chargedAmount: d("1066.37") },
        /does not match charge attempt/,
      ],
      [
        "the goods total",
        { amount: d("999.99") },
        /payments_charged_amount_check/,
      ],
    ])("keeps a captured payment's %s final", async (_label, data, error) => {
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await capture(paymentId, attempt);
      await expect(
        prisma.payment.update({ where: { id: paymentId }, data }),
      ).rejects.toThrow(error);
    });

    it("makes the capture final: no re-pointing, no clearing", async () => {
      const { paymentId } = await createGroupPayment();
      const snapshot = await createRateSnapshot();
      const first = await createChargeAttempt(paymentId, snapshot.id);
      const second = await createChargeAttempt(paymentId, snapshot.id);
      await capture(paymentId, first);

      await expect(capture(paymentId, second)).rejects.toThrow(
        /already captured by charge attempt/,
      );
      await expect(
        prisma.payment.update({
          where: { id: paymentId },
          data: { chargeAttemptId: null },
        }),
      ).rejects.toThrow(/already captured by charge attempt/);
      // The purge gate alone does not open it for a live payment.
      await expect(
        withPurgeGate((tx) =>
          tx.payment.update({
            where: { id: paymentId },
            data: { chargeAttemptId: null },
          }),
        ),
      ).rejects.toThrow(/already captured by charge attempt/);
    });

    it("lets the test-lane purge clear a test payment, delete its attempts and the payment", async () => {
      const { paymentId } = await createGroupPayment({ testLane: true });
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
      });
      expect(payment.isTest).toBe(true);
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
      );
      await capture(paymentId, attempt);

      // Outside the gate even a test payment stays.
      await expect(
        prisma.paymentChargeAttempt.delete({ where: { id: attempt.id } }),
      ).rejects.toThrow(/DELETE refused/);

      // The same order as TestLaneService.resetLane.
      await withPurgeGate(async (tx) => {
        await tx.payment.updateMany({
          where: { id: paymentId, chargeAttemptId: { not: null } },
          data: {
            chargeAttemptId: null,
            chargedAmount: null,
            installmentFeeAmount: 0,
          },
        });
        await tx.paymentChargeAttempt.deleteMany({
          where: { payment: { id: paymentId, isTest: true } },
        });
        await tx.payment.delete({ where: { id: paymentId } });
      });
      expect(
        await prisma.payment.findUnique({ where: { id: paymentId } }),
      ).toBeNull();
    });
  });

  describe("installment_rules", () => {
    it.each<
      [string, Partial<Prisma.InstallmentRuleUncheckedCreateInput>, RegExp]
    >([
      [
        "a count below 2",
        { minCount: 1 },
        /installment_rules_count_range_check/,
      ],
      [
        "a count above 12",
        { maxCount: 13 },
        /installment_rules_count_range_check/,
      ],
      [
        "min above max",
        { minCount: 6, maxCount: 3 },
        /installment_rules_count_range_check/,
      ],
      [
        "a share above 100",
        { platformSharePct: d("100.01") },
        /installment_rules_platform_share_check/,
      ],
      [
        "a negative share",
        { platformSharePct: d("-1.00") },
        /installment_rules_platform_share_check/,
      ],
      [
        "a share on a disallowed range",
        { allowed: false, platformSharePct: d("10.00") },
        /installment_rules_platform_share_check/,
      ],
      [
        "an empty validity window",
        {
          validFrom: new Date("2026-11-05"),
          validUntil: new Date("2026-11-05"),
        },
        /installment_rules_validity_check/,
      ],
      ["a blank name", { name: "   " }, /installment_rules_name_check/],
      [
        "version 1 outside its own lineage",
        { lineageId: "00000000-0000-0000-0000-000000000000" },
        /installment_rules_version_check/,
      ],
      [
        "an archive author without an archive stamp",
        { archivedBy: "admin-test" },
        /installment_rules_archived_check/,
      ],
    ])("refuses %s", async (_label, overrides, error) => {
      await expect(createInstallmentRule(overrides)).rejects.toThrow(error);
    });

    it("accepts a disallowed range without a share", async () => {
      const rule = await createInstallmentRule({
        segment: "all",
        minCount: 7,
        maxCount: 12,
        allowed: false,
        platformSharePct: d("0"),
      });
      expect(rule.allowed).toBe(false);
    });

    it("edits by archiving the version and inserting the next one", async () => {
      const v1 = await createInstallmentRule();
      await expect(
        prisma.installmentRule.update({
          where: { id: v1.id },
          data: { platformSharePct: d("50.00") },
        }),
      ).rejects.toThrow(/is immutable/);

      const v2 = await prisma.$transaction(async (tx) => {
        await tx.installmentRule.update({
          where: { id: v1.id },
          data: { archivedAt: new Date(), archivedBy: "admin-test" },
        });
        return tx.installmentRule.create({
          data: {
            lineageId: v1.lineageId,
            version: 2,
            name: v1.name,
            segment: v1.segment,
            minCount: 2,
            maxCount: 3,
            platformSharePct: d("50.00"),
            validFrom: v1.validFrom,
            createdBy: "admin-test",
          },
        });
      });
      expect(v2.version).toBe(2);

      // An archived version is final.
      await expect(
        prisma.installmentRule.update({
          where: { id: v1.id },
          data: { archivedBy: "someone-else" },
        }),
      ).rejects.toThrow(/is final/);
    });

    // Each value is valid on its own (the CHECKs pass), so only the guard
    // trigger refuses it: a charge attempt points at this version as the
    // rule it was priced with.
    it.each<[string, Prisma.InstallmentRuleUncheckedUpdateInput]>([
      ["lowest count", { minCount: 3 }],
      ["highest count", { maxCount: 6 }],
      ["segment", { segment: "business" }],
      ["allowed flag", { allowed: false, platformSharePct: d("0") }],
      ["priority", { priority: 10 }],
      ["validity window", { validFrom: new Date("2026-12-01T00:00:00Z") }],
      ["open end", { validUntil: new Date("2027-01-01T00:00:00Z") }],
      ["name", { name: "Renamed rule" }],
      ["version", { version: 2 }],
    ])("keeps a live version's %s immutable", async (_label, data) => {
      const rule = await createInstallmentRule();
      await expect(
        prisma.installmentRule.update({ where: { id: rule.id }, data }),
      ).rejects.toThrow(/is immutable \(insert a new version\)/);
    });

    it("refuses a second live version of one lineage", async () => {
      const v1 = await createInstallmentRule();
      await expect(
        prisma.installmentRule.create({
          data: {
            lineageId: v1.lineageId,
            version: 2,
            name: v1.name,
            segment: v1.segment,
            minCount: 2,
            maxCount: 3,
            validFrom: v1.validFrom,
            createdBy: "admin-test",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("refuses DELETE", async () => {
      const rule = await createInstallmentRule();
      await expect(
        prisma.installmentRule.delete({ where: { id: rule.id } }),
      ).rejects.toThrow(/append-only: DELETE refused/);
    });

    it("lets an attempt reference the version it used", async () => {
      const rule = await createInstallmentRule();
      const { paymentId } = await createGroupPayment();
      const attempt = await createChargeAttempt(
        paymentId,
        (await createRateSnapshot()).id,
        {
          installmentRuleId: rule.id,
          platformSharePct: d("100.00"),
          installmentFeeAmount: d("0"),
          chargedAmount: d("1000.00"),
          platformCostAmount: d("50.00"),
          buyerSegment: "premium",
        },
      );
      expect(attempt.installmentRuleId).toBe(rule.id);
    });
  });

  describe("installment_rate_snapshots", () => {
    it("refuses UPDATE", async () => {
      const snapshot = await createRateSnapshot();
      await expect(
        prisma.installmentRateSnapshot.update({
          where: { id: snapshot.id },
          data: { singleRatePct: d("2.500") },
        }),
      ).rejects.toThrow(/append-only: UPDATE refused/);
    });

    it("refuses a single rate of 100 or more", async () => {
      await expect(
        createRateSnapshot({ singleRatePct: d("100.000") }),
      ).rejects.toThrow(/installment_rate_snapshots_single_rate_check/);
    });

    it("deletes an unused snapshot but keeps a used one (Restrict)", async () => {
      const unused = await createRateSnapshot();
      await prisma.installmentRateSnapshot.delete({ where: { id: unused.id } });

      const used = await createRateSnapshot();
      const { paymentId } = await createGroupPayment();
      await createChargeAttempt(paymentId, used.id);
      await expect(
        prisma.installmentRateSnapshot.delete({ where: { id: used.id } }),
      ).rejects.toMatchObject({
        code: "P2003",
        meta: { field_name: expect.stringContaining("rate_snapshot_id_fkey") },
      });
    });
  });

  describe("orders and refund_attempts", () => {
    const paidOrder = async () => {
      const payment = await createGroupPayment();
      const { orderId } = await createGroupOrder(payment);
      return { paymentId: payment.paymentId, orderId };
    };
    const refundAttempt = (
      target: { paymentId: string; orderId: string },
      amount: string,
      fee: string,
    ) =>
      prisma.refundAttempt.create({
        data: {
          ...target,
          idempotencyKey: `refund-installment-${Math.random().toString(36).slice(2)}`,
          amount: d(amount),
          installmentFeeAmount: d(fee),
          provider: "paytr",
        },
      });

    it("defaults an order fee to 0 and refuses a negative one", async () => {
      const { orderId } = await paidOrder();
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.installmentFeeAmount.toFixed(2)).toBe("0.00");
      await expect(
        prisma.order.update({
          where: { id: orderId },
          data: { installmentFeeAmount: d("-0.01") },
        }),
      ).rejects.toThrow(/orders_installment_fee_amount_check/);
    });

    it("stores the fee share as part of the PSP amount", async () => {
      // Plan 4.4: one item of 400.00 refunded with its fee share 26.55.
      const attempt = await refundAttempt(await paidOrder(), "426.55", "26.55");
      expect(attempt.installmentFeeAmount.toFixed(2)).toBe("26.55");
    });

    it("refuses a fee share above the refunded amount or below zero", async () => {
      await expect(
        refundAttempt(await paidOrder(), "10.00", "10.01"),
      ).rejects.toThrow(/refund_attempts_installment_fee_amount_check/);
      await expect(
        refundAttempt(await paidOrder(), "10.00", "-0.01"),
      ).rejects.toThrow(/refund_attempts_installment_fee_amount_check/);
    });
  });

  describe("test-lane reset (TestLaneService.resetLane on the real guards)", () => {
    it("purges test-lane attempts and their captured payments, and keeps live ones", async () => {
      const snapshot = await createRateSnapshot();
      const capturePayment = async (paymentId: string) => {
        const attempt = await createChargeAttempt(paymentId, snapshot.id);
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: "completed",
            chargeAttemptId: attempt.id,
            chargedAmount: attempt.chargedAmount,
            installmentFeeAmount: attempt.installmentFeeAmount,
            installmentCount: attempt.installmentCount,
          },
        });
        return attempt;
      };

      const test = await createGroupPayment({ testLane: true });
      const testCaptured = await capturePayment(test.paymentId);
      // A superseded form of the same payment (never captured).
      const testSuperseded = await createChargeAttempt(
        test.paymentId,
        snapshot.id,
      );
      const live = await createGroupPayment();
      const liveCaptured = await capturePayment(live.paymentId);

      const service = new TestLaneService(
        prisma as unknown as PrismaService,
        { invalidate: jest.fn() } as never,
      );
      const result = await service.resetLane();

      expect(result.deleted.paymentChargeAttempts).toBeGreaterThanOrEqual(2);
      expect(
        await prisma.paymentChargeAttempt.count({
          where: { id: { in: [testCaptured.id, testSuperseded.id] } },
        }),
      ).toBe(0);
      expect(
        await prisma.payment.findUnique({ where: { id: test.paymentId } }),
      ).toBeNull();

      // The live lane is untouched: payment still captured by its attempt.
      const livePayment = await prisma.payment.findUniqueOrThrow({
        where: { id: live.paymentId },
      });
      expect(livePayment.chargeAttemptId).toBe(liveCaptured.id);
      expect(livePayment.chargedAmount?.toFixed(2)).toBe("1066.38");
      expect(
        await prisma.paymentChargeAttempt.count({
          where: { id: liveCaptured.id },
        }),
      ).toBe(1);
    });
  });
});
