import { Logger } from "@nestjs/common";
import { PayoutStatus, RefundAttemptStatus } from "@prisma/client";
import { PlatformTransferRequestError } from "../payment-providers/transfer-errors";
import { sellerFailureText } from "./helpers/payout-failure-reasons";
import {
  PayoutProcessorWorld,
  buildPayoutProcessor,
  type TransferMock,
} from "./testing/payout-processor-fixture";

/**
 * Sentry TARODAN-API-30..36: every failure (PayTR business rejection or a
 * thrown network error) was retried three times with the same trans_id, a
 * network error was stored as "Bad Request Exception", and the seller got
 * PayTR's raw text. The policy is now per outcome:
 *
 * | outcome                         | action                                        |
 * | PayTR err_no 010                | retry_pending (recompute), then failed        |
 * | other PayTR rejection           | failed at once                                |
 * | connect phase (request not sent)| retry_pending, same trans_id, then failed     |
 * | after send / unknown            | failed, never resent by the cron              |
 *
 * Only a bank-details rejection (and the pre-send IBAN checks) e-mails the
 * seller, with mapped text.
 */

function world349(transId = "PYTRETRY1") {
  const world = new PayoutProcessorWorld();
  world.addPayment("pay-1", 349);
  world.addOrderPayout({
    payoutId: "p1",
    paymentId: "pay-1",
    orderId: "o1",
    orderTotal: 349,
    holdAmount: 300,
    merchantOid: "GRPTEST000001T000001",
    transId,
  });
  return world;
}

/** Moves a retry_pending row past its backoff and runs one cron tick. */
async function nextTick(
  world: PayoutProcessorWorld,
  service: ReturnType<typeof buildPayoutProcessor>["service"],
) {
  for (const row of world.payouts) {
    if (row.status === PayoutStatus.retry_pending) {
      row.nextRetryAt = new Date(Date.now() - 1000);
    }
  }
  await service.processRetryPayouts();
  await service.processPendingPayouts();
}

const paytrError = (err_no: string, err_msg: string) => ({
  status: "error",
  err_no,
  err_msg,
});

const notSent = (code: string) =>
  new PlatformTransferRequestError("not_sent", code, `fetch failed (${code})`);
const unknownOutcome = (code: string) =>
  new PlatformTransferRequestError("unknown", code, `fetch failed (${code})`);

describe("payout transfer retry policy", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe("PayTR err_no 010 (total above what the oid has left)", () => {
    it("retries with a recomputed total, then fails as transfer_total_exceeds_remaining without e-mail", async () => {
      const world = world349();
      const createPlatformTransfer: TransferMock = jest.fn(async () =>
        paytrError("010", "toplam transfer tutarı kalan tutardan fazla olamaz"),
      );
      const { service, notification } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });

      await service.processPendingPayouts();
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.retry_pending,
        failureReason: "transfer_total_exceeds_remaining",
        retryCount: 1,
        submittedTotalAmount: null,
      });

      // A refund lands between attempts: the next attempt sends less.
      world.refundAttempts.push({
        paymentId: "pay-1",
        orderId: "o1",
        tradeId: null,
        amount: 9,
        status: RefundAttemptStatus.finalized,
      });
      await nextTick(world, service);
      await nextTick(world, service);

      expect(
        createPlatformTransfer.mock.calls.map(([arg]) => arg.totalAmount),
      ).toEqual([349, 340, 340]);
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "transfer_total_exceeds_remaining",
        retryCount: 3,
        submittedTotalAmount: null,
        providerResponse: expect.objectContaining({ err_no: "010" }),
      });
      expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /p1.*PYTRETRY1.*transfer_total_exceeds_remaining/,
        ),
      );
    });
  });

  describe("other PayTR rejections fail at once", () => {
    it("a bank-details rejection fails on the first attempt and e-mails mapped text, never PayTR's", async () => {
      const world = world349();
      const raw = "IBAN ile alıcı adı uyuşmuyor GRPTEST000001T000001";
      const createPlatformTransfer: TransferMock = jest.fn(async () =>
        paytrError("005", raw),
      );
      const { service, notification } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });

      await service.processPendingPayouts();
      await nextTick(world, service);

      expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "bank_details_rejected",
        retryCount: 1,
        providerResponse: expect.objectContaining({ err_msg: raw }),
      });
      expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
      const [, template, data] =
        notification.sendTemplateEmailToUser.mock.calls[0];
      expect(template).toBe("payout-failed-seller");
      expect(data.failureReason).toBe(
        sellerFailureText("bank_details_rejected"),
      );
      expect(JSON.stringify(data)).not.toContain("GRP");
      expect(JSON.stringify(data)).not.toContain("uyuşmuyor");
    });

    it("any other rejection fails at once as provider_rejected without e-mail", async () => {
      const world = world349();
      const createPlatformTransfer: TransferMock = jest.fn(async () =>
        paytrError("003", "Sistem hatası"),
      );
      const { service, notification } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });

      await service.processPendingPayouts();
      await nextTick(world, service);

      expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.failed,
        failureReason: "provider_rejected",
        submittedTotalAmount: null,
      });
      expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
    });
  });

  describe("connect-phase errors (request never left the host)", () => {
    it.each([
      "UND_ERR_CONNECT_TIMEOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ENETUNREACH",
      "EHOSTUNREACH",
    ])(
      "%s: retry_pending with the same trans_id, then provider_unreachable without e-mail",
      async (code) => {
        const world = world349();
        const createPlatformTransfer: TransferMock = jest.fn(async () => {
          throw notSent(code);
        });
        const { service, notification } = buildPayoutProcessor(world, {
          createPlatformTransfer,
        });

        await service.processPendingPayouts();
        expect(world.payout("p1")).toMatchObject({
          status: PayoutStatus.retry_pending,
          failureReason: "provider_unreachable",
          submittedTotalAmount: null,
          providerResponse: {
            error: expect.objectContaining({
              phase: "not_sent",
              causeCode: code,
            }),
          },
        });
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(code));

        await nextTick(world, service);
        await nextTick(world, service);

        expect(
          new Set(createPlatformTransfer.mock.calls.map(([a]) => a.transId)),
        ).toEqual(new Set(["PYTRETRY1"]));
        expect(createPlatformTransfer).toHaveBeenCalledTimes(3);
        expect(world.payout("p1")).toMatchObject({
          status: PayoutStatus.failed,
          failureReason: "provider_unreachable",
          retryCount: 3,
        });
        expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(code));
      },
    );
  });

  describe("outcome unknown (the request may have reached PayTR)", () => {
    it.each([
      ["ECONNRESET", unknownOutcome("ECONNRESET")],
      ["ETIMEDOUT", unknownOutcome("ETIMEDOUT")],
      ["UND_ERR_SOCKET", unknownOutcome("UND_ERR_SOCKET")],
      ["UND_ERR_HEADERS_TIMEOUT", unknownOutcome("UND_ERR_HEADERS_TIMEOUT")],
      ["TimeoutError", unknownOutcome("TimeoutError")],
      ["HTTP_502", unknownOutcome("HTTP_502")],
      ["INVALID_BODY", unknownOutcome("INVALID_BODY")],
      ["an untyped error", new Error("something odd")],
    ])(
      "%s: failed / transfer_outcome_unknown at once, total kept, never resent by the cron",
      async (label, thrown) => {
        const world = world349();
        const createPlatformTransfer: TransferMock = jest.fn(async () => {
          throw thrown;
        });
        const { service, notification } = buildPayoutProcessor(world, {
          createPlatformTransfer,
        });

        await service.processPendingPayouts();
        await nextTick(world, service);
        await nextTick(world, service);
        await service.requeueRefundVoidedPayouts();
        await service.processPendingPayouts();

        expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
        expect(world.payout("p1")).toMatchObject({
          status: PayoutStatus.failed,
          failureReason: "transfer_outcome_unknown",
          submittedTotalAmount: 349,
          submittedAmount: 300,
          transId: "PYTRETRY1",
        });
        expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
        const logged = errorSpy.mock.calls.map(([m]) => String(m)).join("\n");
        expect(logged).toMatch(/p1.*PYTRETRY1.*transfer_outcome_unknown/);
        if (thrown instanceof PlatformTransferRequestError) {
          expect(logged).toContain(label);
        }
        expect(logged).not.toContain("Bad Request Exception");
      },
    );

    it("a PayTR callback for the unknown-outcome transfer completes it once, even when repeated", async () => {
      const world = world349();
      const createPlatformTransfer: TransferMock = jest.fn(async () => {
        throw unknownOutcome("ECONNRESET");
      });
      const { service, notification, ledger } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });
      await service.processPendingPayouts();
      const sentAt = world.payout("p1").updatedAt;

      await service.handleTransferResultCallback('["PYTRETRY1"]', "hash");
      await service.handleTransferResultCallback('["PYTRETRY1"]', "hash");

      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.completed,
        failureReason: null,
        // The returned-transfer match by IBAN + amount + date needs the send
        // time; no PayTR reference came back for this one.
        submittedAt: sentAt,
      });
      expect(world.payout("p1").processedAt).toBeInstanceOf(Date);
      const released = notification.sendTemplateEmailToUser.mock.calls.filter(
        ([, template]) => template === "payout-released-seller",
      );
      expect(released).toHaveLength(1);
      expect(released[0][2]).toMatchObject({ payoutAmount: 300 });
      expect(ledger.record).toHaveBeenCalledTimes(1);
      expect(ledger.record.mock.calls[0][1]).toMatchObject({
        idempotencyKey: "payout-completed:p1",
      });
    });

    it("a callback never revives a failed payout with another reason", async () => {
      const world = world349();
      const createPlatformTransfer: TransferMock = jest.fn(async () =>
        paytrError("003", "Sistem hatası"),
      );
      const { service, ledger } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });
      await service.processPendingPayouts();

      await service.handleTransferResultCallback('["PYTRETRY1"]', "hash");

      expect(world.payout("p1").status).toBe(PayoutStatus.failed);
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it("the unknown-outcome total keeps counting against siblings on the same oid", async () => {
      const world = world349();
      world.payments.get("pay-1")!.amount = 449;
      world.addOrderPayout({
        payoutId: "p2",
        paymentId: "pay-1",
        orderId: "o2",
        orderTotal: 100,
        holdAmount: 90,
        merchantOid: "GRPTEST000001T000001",
        transId: "PYTSIBLING2",
      });
      const createPlatformTransfer: TransferMock = jest.fn(async (arg) => {
        if (arg.transId === "PYTRETRY1") throw unknownOutcome("ECONNRESET");
        return { status: "success" };
      });
      const { service } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });

      await service.processPendingPayouts();

      expect(createPlatformTransfer.mock.calls[1][0]).toMatchObject({
        transId: "PYTSIBLING2",
        totalAmount: 100,
      });
      // 449 - 349 (unknown, may be gone) = 100: still fits; one kurus more would not.
      expect(world.payout("p2").submittedTotalAmount).toBe(100);
    });
  });

  describe("failures that are not transfer outcomes", () => {
    it("a provider that cannot be resolved stops the run before the claim; the payout stays pending", async () => {
      const world = world349();
      const { service, createPlatformTransfer } = buildPayoutProcessor(world, {
        resolve: () => {
          throw new Error("no provider registered");
        },
      });

      await expect(service.processPendingPayouts()).rejects.toThrow(
        "no provider registered",
      );

      expect(createPlatformTransfer).not.toHaveBeenCalled();
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.pending,
        failureReason: null,
        submittedTotalAmount: null,
      });
    });

    it("a configuration error before sending (PRE_SEND) stops the run and leaves the payout pending", async () => {
      const world = world349();
      world.addOrderPayout({
        payoutId: "p2",
        paymentId: "pay-1",
        orderId: "o2",
        orderTotal: 100,
        holdAmount: 90,
        merchantOid: "OTHER1",
        transId: "PYTSECOND2",
      });
      const createPlatformTransfer: TransferMock = jest.fn(async () => {
        throw new PlatformTransferRequestError(
          "not_sent",
          "PRE_SEND",
          "marketplace credentials missing",
        );
      });
      const { service, notification } = buildPayoutProcessor(world, {
        createPlatformTransfer,
      });

      await expect(service.processPendingPayouts()).rejects.toThrow(
        "marketplace credentials missing",
      );

      expect(createPlatformTransfer).toHaveBeenCalledTimes(1);
      for (const id of ["p1", "p2"]) {
        expect(world.payout(id)).toMatchObject({
          status: PayoutStatus.pending,
          failureReason: null,
          retryCount: 0,
          submittedTotalAmount: null,
        });
      }
      expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
    });

    it("a bookkeeping error after PayTR accepted leaves the row processing and the batch goes on", async () => {
      const world = world349();
      world.payments.get("pay-1")!.amount = 449;
      world.addOrderPayout({
        payoutId: "p2",
        paymentId: "pay-1",
        orderId: "o2",
        orderTotal: 100,
        holdAmount: 90,
        merchantOid: "GRPTEST000001T000001",
        transId: "PYTSIBLING2",
      });
      const { service, prisma, createPlatformTransfer, notification } =
        buildPayoutProcessor(world);
      // The first write after PayTR's acceptance fails (p1).
      prisma.payoutTransfer.update.mockRejectedValueOnce(
        new Error("connection terminated"),
      );

      const result = await service.processPendingPayouts();

      expect(createPlatformTransfer).toHaveBeenCalledTimes(2);
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.processing,
        submittedTotalAmount: 349,
        submittedAt: null,
        failureReason: null,
        retryCount: 0,
      });
      expect(world.payout("p2").status).toBe(PayoutStatus.completed);
      expect(result).toMatchObject({ processed: 1, failed: 0 });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /p1.*PYTRETRY1.*accepted by PayTR.*do not resend/,
        ),
      );
      // Only p2 completed: one release e-mail.
      expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("callback for a payout whose bookkeeping failed", () => {
    it("completes it once and stamps the send time and net so a bank return can be matched", async () => {
      const world = world349();
      const { service, prisma, notification, ledger } = buildPayoutProcessor(
        world,
        { callbackFlag: true },
      );
      prisma.payoutTransfer.update.mockRejectedValueOnce(
        new Error("connection terminated"),
      );
      await service.processPendingPayouts();
      const claimedAt = world.payout("p1").updatedAt;
      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.processing,
        submittedAt: null,
        submittedAmount: null,
      });

      await service.handleTransferResultCallback('["PYTRETRY1"]', "hash");
      await service.handleTransferResultCallback('["PYTRETRY1"]', "hash");

      expect(world.payout("p1")).toMatchObject({
        status: PayoutStatus.completed,
        submittedAt: claimedAt,
        submittedAmount: 300,
      });
      expect(ledger.record).toHaveBeenCalledTimes(1);
      expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("pre-send checks e-mail mapped text, not the code", () => {
    it.each([
      ["no_bank_account", null],
      ["invalid_iban_format", "TR330006100519786457841327"],
    ])("%s", async (reason, iban) => {
      const world = world349();
      world.bankAccount = iban
        ? { ...world.bankAccount, iban }
        : (null as unknown as Record<string, unknown>);
      const { service, notification, createPlatformTransfer } =
        buildPayoutProcessor(world);

      await service.processPendingPayouts();

      expect(createPlatformTransfer).not.toHaveBeenCalled();
      expect(world.payout("p1").failureReason).toBe(reason);
      expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
        "seller-1",
        "payout-failed-seller",
        expect.objectContaining({ failureReason: sellerFailureText(reason) }),
      );
    });
  });
});
