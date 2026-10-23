import { BadRequestException } from "@nestjs/common";
import {
  BoostSource,
  BoostStatus,
  CancellationActor,
  PaymentStatus,
  Prisma,
} from "@prisma/client";
import { AdminBoostOperationsService } from "./admin-boost-operations.service";
import {
  RefundAttemptInFlightException,
  RefundPendingReconciliationException,
} from "../../../payment-providers/refund-errors";
import { notifyWebRevalidate } from "../../../../common/helpers/revalidate";

jest.mock("../../../../common/helpers/revalidate", () => ({
  ...jest.requireActual("../../../../common/helpers/revalidate"),
  notifyWebRevalidate: jest.fn().mockResolvedValue(undefined),
}));

const D = (v: number | string) => new Prisma.Decimal(v);
const ADMIN = "admin-user";
const REASON = "Seller reported a listing outage";

/**
 * Behaviour pin of the staff boost operations (tarodan-ops plan
 * 2026-10-21-listing-boost, LB4): free grant, revoke of a grant, refund and
 * stop of a paid boost. The timeline, the refund executor, the audit and the
 * notices are fakes; their own specs pin what they do.
 */
describe("AdminBoostOperationsService", () => {
  const notify = notifyWebRevalidate as jest.Mock;
  beforeEach(() => notify.mockClear());

  const paidBoost = (over: Record<string, unknown> = {}) => ({
    id: "boost-1",
    source: BoostSource.purchase,
    status: BoostStatus.active,
    price: D(59),
    refundedAmount: null as Prisma.Decimal | null,
    orderId: "order-1",
    productId: "prod-1",
    ...over,
  });

  const make = (
    over: {
      boost?: Record<string, unknown> | null;
      paymentStatus?: PaymentStatus;
      boostAfterRefund?: BoostStatus;
    } = {},
  ) => {
    const tx = { marker: "tx" };
    const boostRow = over.boost === undefined ? paidBoost() : over.boost;
    // What happened, in order: the commit, the API list cache, the web call.
    const events: string[] = [];
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => {
        const result = await fn(tx);
        events.push("commit");
        return result;
      }),
      product: { findFirst: jest.fn().mockResolvedValue({ id: "prod-1" }) },
      adPackage: {
        findUnique: jest.fn().mockResolvedValue({
          id: "pkg-1",
          name: "Vitrin",
          showcaseOnHome: true,
        }),
      },
      productBoost: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(boostRow)
          .mockResolvedValue({
            status: over.boostAfterRefund ?? BoostStatus.cancelled,
          }),
      },
      refundAttempt: { count: jest.fn().mockResolvedValue(0) },
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "order-1",
          orderNumber: "BST-100",
          payment: {
            status: over.paymentStatus ?? PaymentStatus.completed,
            amount: D(59),
            metadata: {},
          },
        }),
      },
    };
    const timeline = {
      grant: jest.fn().mockResolvedValue({
        boostId: "grant-1",
        productId: "prod-1",
        endsAt: new Date("2026-10-28T12:00:00.000Z"),
      }),
      cancel: jest.fn().mockResolvedValue({
        stopped: true,
        boostId: "boost-1",
        productId: "prod-1",
        unconsumedSeconds: 3600,
      }),
    };
    const payments = {
      processRefund: jest.fn().mockResolvedValue({ success: true }),
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const purchases = {
      getPurchase: jest.fn(async (id: string) => ({ id })),
    };
    const notices = { flush: jest.fn().mockResolvedValue(undefined) };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn(async () => {
        events.push("api-list-cache");
        return 1;
      }),
    };
    const search = { syncProduct: jest.fn().mockResolvedValue(undefined) };
    (notifyWebRevalidate as jest.Mock).mockImplementation(async () => {
      events.push("web");
    });
    const sentry = {
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
      captureMessage: jest.fn(),
    };
    const service = new AdminBoostOperationsService(
      prisma as never,
      timeline as never,
      payments as never,
      audit as never,
      purchases as never,
      notices as never,
      cache as never,
      search as never,
      sentry as never,
    );
    return {
      service,
      events,
      cache,
      search,
      tx,
      prisma,
      timeline,
      payments,
      audit,
      purchases,
      notices,
      sentry,
    };
  };

  describe("grant", () => {
    const dto = {
      productId: "u010001",
      packageId: "pkg-1",
      durationDays: 7,
      reason: REASON,
    };

    it("finds the listing by id or listing code and grants with the package snapshot", async () => {
      const { service, prisma, timeline, tx } = make();

      await expect(service.grant(ADMIN, dto)).resolves.toEqual({
        id: "grant-1",
      });

      expect(prisma.product.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ id: "u010001" }, { productCode: "U010001" }] },
        select: { id: true },
      });
      expect(timeline.grant).toHaveBeenCalledWith(tx, {
        productId: "prod-1",
        packageId: "pkg-1",
        packageName: "Vitrin",
        showcaseOnHome: true,
        durationDays: 7,
        grantedById: ADMIN,
        reason: REASON,
      });
    });

    it("writes the audit row in the grant's transaction, then sends the notice", async () => {
      const { service, audit, notices, tx, sentry } = make();

      await service.grant(ADMIN, dto);

      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_grant",
        "ProductBoost",
        "grant-1",
        null,
        expect.objectContaining({ durationDays: 7, reason: REASON }),
        tx,
      );
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "grant-1",
        kind: "granted",
      });
      expect(sentry.setTag).toHaveBeenCalledWith("flow", "boost");
    });

    it("without a package grants search priority only", async () => {
      const { service, timeline, prisma } = make();

      await service.grant(ADMIN, { ...dto, packageId: undefined });

      expect(prisma.adPackage.findUnique).not.toHaveBeenCalled();
      expect(timeline.grant).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          packageId: null,
          packageName: null,
          showcaseOnHome: false,
        }),
      );
    });

    it("answers 404 for an unknown listing or package and writes nothing", async () => {
      const unknownListing = make();
      unknownListing.prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        unknownListing.service.grant(ADMIN, dto),
      ).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.product.notFound" },
      });
      expect(unknownListing.timeline.grant).not.toHaveBeenCalled();

      const unknownPackage = make();
      unknownPackage.prisma.adPackage.findUnique.mockResolvedValue(null);
      await expect(
        unknownPackage.service.grant(ADMIN, dto),
      ).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.admin.adPackage.notFound" },
      });
      expect(unknownPackage.timeline.grant).not.toHaveBeenCalled();
    });

    it("passes the timeline's refusal through and sends no notice", async () => {
      const { service, timeline, audit, notices } = make();
      timeline.grant.mockRejectedValue(
        new BadRequestException({
          i18nKey: "server.admin.boost.grantListingNotActive",
        }),
      );

      await expect(service.grant(ADMIN, dto)).rejects.toMatchObject({
        response: { i18nKey: "server.admin.boost.grantListingNotActive" },
      });
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
      expect(notices.flush).not.toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    const grantRow = paidBoost({
      source: BoostSource.admin_grant,
      price: D(0),
      orderId: null,
    });

    it("stops a grant in one transaction with its audit row, then notifies", async () => {
      const { service, timeline, audit, notices, tx } = make({
        boost: grantRow,
      });

      await expect(
        service.revoke(ADMIN, "boost-1", { reason: REASON }),
      ).resolves.toEqual({ id: "boost-1" });

      expect(timeline.cancel).toHaveBeenCalledWith(tx, "boost-1", {
        actorId: ADMIN,
        reason: REASON,
      });
      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_revoke",
        "ProductBoost",
        "boost-1",
        { status: BoostStatus.active },
        expect.objectContaining({ reason: REASON, unconsumedSeconds: 3600 }),
        tx,
      );
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "boost-1",
        kind: "cancelled",
      });
    });

    it("refuses a paid boost: it is refunded and stopped instead", async () => {
      const { service, prisma } = make();

      await expect(
        service.revoke(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.admin.boost.revokeGrantOnly" },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses a grant that ended or was stopped under the lock", async () => {
      const { service, timeline, audit, notices } = make({ boost: grantRow });
      timeline.cancel.mockResolvedValue({
        stopped: false,
        status: BoostStatus.expired,
      });

      await expect(
        service.revoke(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.boost.stopActiveOrPausedOnly" },
      });
      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
      expect(notices.flush).not.toHaveBeenCalled();
    });

    it("answers 404 for an unknown boost", async () => {
      const { service } = make({ boost: null });

      await expect(
        service.revoke(ADMIN, "missing", { reason: REASON }),
      ).rejects.toMatchObject({
        status: 404,
        response: { i18nKey: "server.admin.adPackage.purchaseNotFound" },
      });
    });
  });

  describe("refund and stop", () => {
    const refundOpts = {
      idempotencyKey: "boost-refund:boost-1:0",
      cancelledBy: CancellationActor.platform,
      boostStop: { actorId: ADMIN, reason: REASON },
      claimGuard: expect.any(Function),
    };

    /** The claim guard processRefund was given, run on a fake transaction. */
    const runGuard = (
      payments: { processRefund: jest.Mock },
      status: BoostStatus | null,
    ) => {
      const guard = payments.processRefund.mock.calls[0][2].claimGuard as (
        tx: unknown,
      ) => Promise<void>;
      return guard({
        productBoost: {
          findUnique: jest
            .fn()
            .mockResolvedValue(status === null ? null : { status }),
        },
      });
    };

    it("refunds all that is refundable by default, with one key per boost", async () => {
      const { service, payments, purchases } = make();

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).resolves.toEqual({ id: "boost-1" });

      expect(payments.processRefund).toHaveBeenCalledWith(
        "order-1",
        59,
        refundOpts,
      );
      expect(purchases.getPurchase).toHaveBeenCalledWith("boost-1");
    });

    it("after a refused try, the next one gets a fresh key and may change the amount", async () => {
      const { service, payments, prisma } = make();
      prisma.refundAttempt.count.mockResolvedValue(1);

      await service.refund(ADMIN, "boost-1", { reason: REASON, amount: 40 });

      expect(prisma.refundAttempt.count).toHaveBeenCalledWith({
        where: {
          orderId: "order-1",
          idempotencyKey: { startsWith: "boost-refund:boost-1:" },
        },
      });
      expect(payments.processRefund).toHaveBeenCalledWith("order-1", 40, {
        ...refundOpts,
        idempotencyKey: "boost-refund:boost-1:1",
      });
    });

    it.each([
      [BoostStatus.active, true],
      [BoostStatus.paused, true],
      [BoostStatus.cancelled, false],
      [BoostStatus.expired, false],
      [null, false],
    ])(
      "the claim guard, under the payment lock, lets a %s boost through: %p",
      async (status, allowed) => {
        const { service, payments } = make();
        await service.refund(ADMIN, "boost-1", { reason: REASON });

        const run = runGuard(payments, status);
        if (allowed) await expect(run).resolves.toBeUndefined();
        else
          await expect(run).rejects.toMatchObject({
            response: { i18nKey: "server.admin.boost.refundNotAllowed" },
          });
      },
    );

    it("audits nothing as refunded when another path had already finished the attempt", async () => {
      const { service, payments, audit } = make();
      payments.processRefund.mockResolvedValue({
        success: true,
        idempotent: true,
      });

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    });

    it("a failed audit write after the refund went through is reported, not thrown", async () => {
      const { service, audit, sentry, notices } = make();
      audit.createRequiredAuditLog.mockRejectedValue(new Error("db down"));

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).resolves.toEqual({ id: "boost-1" });
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        "Boost boost-1 refund audit row missing (order BST-100)",
        "error",
      );
      expect(notices.flush).toHaveBeenCalled();
    });

    it("refunds a partial amount the admin entered", async () => {
      const { service, payments } = make();

      await service.refund(ADMIN, "boost-1", { reason: REASON, amount: 20 });

      expect(payments.processRefund).toHaveBeenCalledWith(
        "order-1",
        20,
        refundOpts,
      );
    });

    it("keeps kurus exact in the amount it sends to the refund", async () => {
      const { service, payments, prisma } = make({
        boost: paidBoost({ price: D("59.90") }),
      });
      prisma.order.findUnique.mockResolvedValue({
        id: "order-1",
        orderNumber: "BST-100",
        payment: {
          status: PaymentStatus.completed,
          amount: D("59.90"),
          metadata: {},
        },
      });

      await service.refund(ADMIN, "boost-1", { reason: REASON });
      prisma.productBoost.findUnique.mockResolvedValueOnce(
        paidBoost({ price: D("59.90") }),
      );
      await service.refund(ADMIN, "boost-1", {
        reason: REASON,
        amount: 20.55,
      });

      expect(payments.processRefund.mock.calls.map((c) => c[1])).toEqual([
        59.9, 20.55,
      ]);
    });

    it("caps at what is left of the price after an earlier refund on the boost", async () => {
      const { service, payments } = make({
        boost: paidBoost({ refundedAmount: D("9.00") }),
      });

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(payments.processRefund).toHaveBeenCalledWith(
        "order-1",
        50,
        refundOpts,
      );
    });

    it.each([59.01, 100])(
      "refuses %p TL, above the refundable 59, before any money moves",
      async (amount) => {
        const { service, payments } = make();

        await expect(
          service.refund(ADMIN, "boost-1", { reason: REASON, amount }),
        ).rejects.toMatchObject({
          status: 400,
          response: {
            i18nKey: "server.admin.boost.refundAmountInvalid",
            i18nParams: { max: 59 },
          },
        });
        expect(payments.processRefund).not.toHaveBeenCalled();
      },
    );

    it.each([
      [
        "a free grant",
        { source: BoostSource.admin_grant, price: D(0), orderId: null },
      ],
      ["an ended boost (D2)", { status: BoostStatus.expired }],
      ["an unpaid boost", { status: BoostStatus.pending }],
      ["a boost without an order", { orderId: null }],
    ])("refuses %s", async (_label, over) => {
      const { service, payments } = make({ boost: paidBoost(over) });

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: "server.admin.boost.refundNotAllowed" },
      });
      expect(payments.processRefund).not.toHaveBeenCalled();
    });

    it("refuses when the payment is not completed", async () => {
      const { service, payments } = make({
        paymentStatus: PaymentStatus.refunded,
      });

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.boost.refundNotAllowed" },
      });
      expect(payments.processRefund).not.toHaveBeenCalled();
    });

    it("audits the refund after it went through, then notifies the seller", async () => {
      const { service, audit, notices, payments } = make();

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_refund",
        "ProductBoost",
        "boost-1",
        { status: BoostStatus.active, refundedAmount: null },
        {
          outcome: "refunded",
          amount: 59,
          orderNumber: "BST-100",
          reason: REASON,
        },
      );
      expect(
        audit.createRequiredAuditLog.mock.invocationCallOrder[0],
      ).toBeGreaterThan(payments.processRefund.mock.invocationCallOrder[0]);
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "boost-1",
        kind: "refunded",
      });
    });

    it("a PayTR failure reaches the admin, is audited as failed and notifies nobody", async () => {
      const { service, payments, audit, notices, purchases } = make();
      const refusal = new BadRequestException({
        i18nKey: "server.payment.paytrRefundFailed",
      });
      payments.processRefund.mockRejectedValue(refusal);

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBe(refusal);

      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_refund",
        "ProductBoost",
        "boost-1",
        expect.anything(),
        expect.objectContaining({ outcome: "failed" }),
      );
      expect(notices.flush).not.toHaveBeenCalled();
      expect(purchases.getPurchase).not.toHaveBeenCalled();
    });

    it("an uncertain PayTR outcome is audited as pending reconciliation", async () => {
      const { service, payments, audit } = make();
      payments.processRefund.mockRejectedValue(
        new RefundPendingReconciliationException("timeout"),
      );

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBeInstanceOf(RefundPendingReconciliationException);
      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_refund",
        "ProductBoost",
        "boost-1",
        expect.anything(),
        expect.objectContaining({ outcome: "pending_reconciliation" }),
      );
    });

    it("a try turned away while another one is in flight is audited as such, not as a pending refund of its own", async () => {
      const { service, payments, audit, notices } = make();
      payments.processRefund.mockRejectedValue(
        new RefundAttemptInFlightException("in flight"),
      );

      // Same answer to the admin as before (503, pending reconciliation).
      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBeInstanceOf(RefundPendingReconciliationException);
      expect(audit.createRequiredAuditLog).toHaveBeenCalledTimes(1);
      expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
        ADMIN,
        "boost_refund",
        "ProductBoost",
        "boost-1",
        expect.anything(),
        expect.objectContaining({ outcome: "in_flight_elsewhere" }),
      );
      expect(notices.flush).not.toHaveBeenCalled();
    });

    it("an audit failure never hides the refund error", async () => {
      const { service, payments, audit } = make();
      const refusal = new BadRequestException({
        i18nKey: "server.payment.paytrRefundFailed",
      });
      payments.processRefund.mockRejectedValue(refusal);
      audit.createRequiredAuditLog.mockRejectedValue(new Error("db down"));

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBe(refusal);
    });

    it("answers a replay of a finished refund with the purchase and refunds nothing", async () => {
      const { service, payments, purchases } = make({
        boost: paidBoost({
          status: BoostStatus.cancelled,
          refundedAmount: D(59),
        }),
      });

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).resolves.toEqual({ id: "boost-1" });
      await expect(
        make({
          boost: paidBoost({
            status: BoostStatus.cancelled,
            refundedAmount: D(59),
          }),
        }).service.refund(ADMIN, "boost-1", { reason: REASON, amount: 59 }),
      ).resolves.toEqual({ id: "boost-1" });
      expect(payments.processRefund).not.toHaveBeenCalled();
      expect(purchases.getPurchase).toHaveBeenCalledWith("boost-1");
    });

    it("a stopped boost with another amount is not refundable again", async () => {
      const { service, payments } = make({
        boost: paidBoost({
          status: BoostStatus.cancelled,
          refundedAmount: D(20),
        }),
      });

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON, amount: 39 }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.admin.boost.refundNotAllowed" },
      });
      expect(payments.processRefund).not.toHaveBeenCalled();
    });

    it("reports to Sentry when the refund went through but the boost still runs", async () => {
      const { service, sentry } = make({
        boostAfterRefund: BoostStatus.active,
      });

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(sentry.captureMessage).toHaveBeenCalledWith(
        "Boost boost-1 refunded but not stopped (order BST-100)",
        "error",
      );
    });

    it("traces the flow by boost id and order number only", async () => {
      const { service, sentry } = make();

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(sentry.setTag).toHaveBeenCalledWith("flow", "boost");
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { boostId: "boost-1", orderNumber: "BST-100" },
        }),
      );
    });

    it("answers 404 for an unknown boost", async () => {
      const { service } = make({ boost: null });

      await expect(
        service.refund(ADMIN, "missing", { reason: REASON }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  /**
   * After a committed change the listing's caches, search entry and the web
   * lists are refreshed, so the home rails show it without waiting out the
   * API list cache (120 s) and the web ISR window. API cache first, then the
   * web, never inside the transaction, never on a change that did not happen.
   */
  describe("listing refresh after the change", () => {
    const listingTags = ["products:list", "product:prod-1"];

    it("a grant refreshes the listing after its commit, the API list cache before the web", async () => {
      const { service, events, cache, search } = make();

      await service.grant(ADMIN, {
        productId: "u010001",
        durationDays: 7,
        reason: REASON,
      });

      expect(events).toEqual(["commit", "api-list-cache", "web"]);
      expect(cache.del).toHaveBeenCalledWith("products:detail:prod-1");
      expect(cache.delPattern).toHaveBeenCalledWith("products:list:*");
      expect(search.syncProduct).toHaveBeenCalledWith("prod-1");
      expect(notify).toHaveBeenCalledWith(listingTags);
    });

    it("a grant whose transaction fails refreshes nothing", async () => {
      const { service, timeline, cache } = make();
      timeline.grant.mockRejectedValue(new Error("lock timeout"));

      await expect(
        service.grant(ADMIN, {
          productId: "u010001",
          durationDays: 7,
          reason: REASON,
        }),
      ).rejects.toThrow("lock timeout");
      expect(cache.delPattern).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it("a revoke refreshes the stopped listing after its commit", async () => {
      const { service, events } = make({
        boost: paidBoost({ source: BoostSource.admin_grant, orderId: null }),
      });

      await service.revoke(ADMIN, "boost-1", { reason: REASON });

      expect(events).toEqual(["commit", "api-list-cache", "web"]);
      expect(notify).toHaveBeenCalledWith(listingTags);
    });

    it("a revoke that stopped nothing under the lock refreshes nothing", async () => {
      const { service, timeline, cache } = make({
        boost: paidBoost({ source: BoostSource.admin_grant, orderId: null }),
      });
      timeline.cancel.mockResolvedValue({
        stopped: false,
        status: BoostStatus.expired,
      });

      await expect(
        service.revoke(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(cache.delPattern).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it("a refund that stopped the boost refreshes its listing after the refund", async () => {
      const { service, payments, cache } = make();

      await service.refund(ADMIN, "boost-1", { reason: REASON });

      expect(notify).toHaveBeenCalledWith(listingTags);
      expect(cache.delPattern.mock.invocationCallOrder[0]).toBeGreaterThan(
        payments.processRefund.mock.invocationCallOrder[0],
      );
      expect(notify.mock.invocationCallOrder[0]).toBeGreaterThan(
        cache.delPattern.mock.invocationCallOrder[0],
      );
    });

    it("a refund that did not stop the boost, or failed, refreshes nothing", async () => {
      const notStopped = make({ boostAfterRefund: BoostStatus.active });
      await notStopped.service.refund(ADMIN, "boost-1", { reason: REASON });
      expect(notStopped.cache.delPattern).not.toHaveBeenCalled();

      const failed = make();
      failed.payments.processRefund.mockRejectedValue(
        new BadRequestException({
          i18nKey: "server.payment.paytrRefundFailed",
        }),
      );
      await expect(
        failed.service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(failed.cache.delPattern).not.toHaveBeenCalled();

      expect(notify).not.toHaveBeenCalled();
    });

    it("a refresh failure never turns a refund that went through into an error", async () => {
      const { service, cache, notices } = make();
      cache.delPattern.mockRejectedValue(new Error("redis down"));

      await expect(
        service.refund(ADMIN, "boost-1", { reason: REASON }),
      ).resolves.toEqual({ id: "boost-1" });
      expect(notices.flush).toHaveBeenCalledWith({
        boostId: "boost-1",
        kind: "refunded",
      });
    });
  });
});
