import { Prisma } from "@prisma/client";
import { ADMIN_REFUND_BUCKETS } from "@tarodan/types";
import { ExportListService } from "../../../common/export";
import { AdminRefundListService } from "./admin-refund-list.service";
import { refundListSourceWheres } from "./helpers/refund-list-where";

const D = (n: number) => new Prisma.Decimal(n);
const at = (iso: string) => new Date(iso);
const party = (id: string) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `B-${id}`,
});

function requestRow(id: string, createdAt: string) {
  return {
    id,
    refundNumber: `RFD-${id}`,
    createdAt: at(createdAt),
    updatedAt: at(createdAt),
    status: "approved",
    reason: "changed_mind",
    resolvedReason: null,
    description: null,
    policyCode: "buyer_remorse_return",
    amount: D(100),
    refundQuantity: 1,
    refundedAt: null,
    decidedAt: null,
    returnTrackingNumber: null,
    returnProviderTrackingId: null,
    returnStatus: null,
    financialComponents: [],
    order: {
      id: `o-${id}`,
      orderNumber: `ORD-${id}`,
      createdAt: at("2026-10-01T00:00:00.000Z"),
      origin: "direct_sale",
      isTest: false,
      quantity: 1,
      unitPrice: D(100),
      subtotal: D(100),
      shippingAddress: null,
      financialSnapshot: null,
      sellerCommissionAmount: D(8),
      buyerCommissionAmount: D(2),
      buyer: party("b1"),
      seller: party("s1"),
      product: { id: "p1", title: "Ürün", productCode: null, price: D(100) },
      checkoutGroup: null,
      shipment: null,
      offer: null,
    },
  };
}

function tradeRow(id: string, cancelledAt: string | null) {
  return {
    id,
    tradeNumber: `TKS-${id}`,
    status: cancelledAt ? "cancelled" : "returning",
    createdAt: at("2026-10-01T00:00:00.000Z"),
    updatedAt: at("2026-10-09T00:00:00.000Z"),
    cancelledAt: cancelledAt ? at(cancelledAt) : null,
    cancelReason: null,
    adminCancelReasonCode: null,
    refundFailureReason: null,
    firstWarehouseArrivalAt: null,
    isTest: false,
    initiatorId: "u-ini",
    receiverId: "u-rec",
    initiator: party("u-ini"),
    receiver: party("u-rec"),
    items: [],
    cashPayments: [
      {
        id: `cp-${id}`,
        payerId: "u-ini",
        recipientId: null,
        amount: D(0),
        tradeFeeAmount: D(35),
        shippingAmount: D(60),
        commission: D(0),
        commissionTaxAmount: D(0),
        totalAmount: D(95),
        status: "completed",
        refundedAt: null,
        releasedAt: null,
        fullRefundEntitled: false,
        payment: { id: `pay-${id}`, status: "completed", provider: "paytr" },
      },
    ],
    shipments: [],
    refundAttempts: [],
    dispute: null,
  };
}

function makePrisma() {
  return {
    refundRequest: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    trade: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    refundAttempt: { findMany: jest.fn().mockResolvedValue([]) },
    fiscalInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((queries: Promise<number>[]) => Promise.all(queries)),
  };
}

const service = (prisma: ReturnType<typeof makePrisma>) =>
  new AdminRefundListService(prisma as never, {} as never);

/** Baş sorgusu yalnız sıralama alanlarını seçer; satır sorgusu tam seçer. */
const isHead = (args: { select: Record<string, unknown> }) =>
  Object.keys(args.select).length === 2;

describe("AdminRefundListService.list", () => {
  it("merges refund requests and trade sides by refund time, two rows per trade", async () => {
    const prisma = makePrisma();
    prisma.refundRequest.count.mockResolvedValue(2);
    prisma.trade.count.mockResolvedValue(1);
    prisma.refundRequest.findMany.mockImplementation((args) =>
      Promise.resolve(
        isHead(args)
          ? [
              { id: "r-new", createdAt: at("2026-10-10T00:00:00.000Z") },
              { id: "r-old", createdAt: at("2026-10-01T00:00:00.000Z") },
            ]
          : [
              requestRow("r-new", "2026-10-10T00:00:00.000Z"),
              requestRow("r-old", "2026-10-01T00:00:00.000Z"),
            ],
      ),
    );
    prisma.trade.findMany.mockImplementation((args) =>
      Promise.resolve(
        isHead(args)
          ? [{ id: "t1", cancelledAt: at("2026-10-05T00:00:00.000Z") }]
          : [tradeRow("t1", "2026-10-05T00:00:00.000Z")],
      ),
    );

    const page = await service(prisma).list({});

    expect(page.data.map((row) => row.id)).toEqual([
      "r-new",
      "t1:initiator",
      "t1:responder",
      "r-old",
    ]);
    // Takas iki satır sayılır: 2 talep + 1 takas × 2.
    expect(page.meta).toEqual({ total: 4, page: 1, limit: 20, totalPages: 1 });
    expect(page.data[1].trade?.counterpartRefundId).toBe("t1:responder");
  });

  it("reads half as many trades as rows and orders open trades first", async () => {
    const prisma = makePrisma();
    await service(prisma).list({ tab: "trade", limit: 20 });

    const head = prisma.trade.findMany.mock.calls[0][0];
    expect(head.take).toBe(10);
    expect(head.orderBy).toEqual([
      { cancelledAt: { sort: "desc", nulls: "first" } },
      { updatedAt: "desc" },
      { id: "asc" },
    ]);
    expect(prisma.refundRequest.count).not.toHaveBeenCalled();
  });

  it("ascending puts open trades last and requests oldest first", async () => {
    const prisma = makePrisma();
    await service(prisma).list({ sortOrder: "asc" });

    expect(prisma.trade.findMany.mock.calls[0][0].orderBy[0]).toEqual({
      cancelledAt: { sort: "asc", nulls: "last" },
    });
    expect(prisma.refundRequest.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "asc" },
      { id: "asc" },
    ]);
  });

  it("the direct tab reads only non-offer refund requests", async () => {
    const prisma = makePrisma();
    await service(prisma).list({ tab: "direct" });

    expect(prisma.trade.count).not.toHaveBeenCalled();
    expect(prisma.refundRequest.count).toHaveBeenCalledWith({
      where: { AND: [{ order: { origin: { not: "offer" } } }] },
    });
  });

  it("does not read attempts for a bucket that ignores them", async () => {
    const prisma = makePrisma();
    await service(prisma).list({ bucket: "completed" });
    expect(prisma.refundAttempt.findMany).not.toHaveBeenCalled();
  });

  it("a refunding bucket reads in-flight attempts and filters by their requests", async () => {
    const prisma = makePrisma();
    prisma.refundAttempt.findMany.mockResolvedValue([
      { idempotencyKey: "refund-request:rr-7" },
    ]);

    await service(prisma).list({ tab: "direct", bucket: "refunding" });

    expect(prisma.refundAttempt.findMany).toHaveBeenCalledWith({
      where: {
        idempotencyKey: { startsWith: "refund-request:" },
        status: {
          in: ["prepared", "submitting", "succeeded", "failed", "manual_review"],
        },
      },
      select: { idempotencyKey: true },
    });
    expect(JSON.stringify(prisma.refundRequest.count.mock.calls[0][0])).toContain(
      '"id":{"in":["rr-7"]}',
    );
  });

  it("links a request's attempt and the return invoice cut for it", async () => {
    const prisma = makePrisma();
    prisma.refundRequest.count.mockResolvedValue(1);
    prisma.refundRequest.findMany.mockImplementation((args) =>
      Promise.resolve(
        isHead(args)
          ? [{ id: "r1", createdAt: at("2026-10-10T00:00:00.000Z") }]
          : [requestRow("r1", "2026-10-10T00:00:00.000Z")],
      ),
    );
    prisma.refundAttempt.findMany.mockResolvedValue([
      {
        id: "att-1",
        idempotencyKey: "refund-request:r1",
        status: "finalized",
        amount: D(100),
        createdAt: at("2026-10-11T00:00:00.000Z"),
        finalizedAt: at("2026-10-11T00:00:00.000Z"),
      },
    ]);
    prisma.fiscalInvoice.findMany.mockResolvedValue([
      {
        id: "ret-1",
        sourceId: "inv-9:att-1",
        invoiceNumber: "TRD2026000000001",
        status: "sent",
        createdAt: at("2026-10-12T00:00:00.000Z"),
      },
    ]);

    const page = await service(prisma).list({ tab: "direct" });

    expect(prisma.fiscalInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "return_invoice",
          OR: [{ sourceId: { endsWith: ":att-1" } }],
        },
      }),
    );
    expect(page.data[0].returnInvoice).toEqual({
      id: "ret-1",
      number: "TRD2026000000001",
      status: "sent",
    });
    expect(page.data[0].money.status).toBe("refunded");
  });

  it("links a trade side's return invoice through its service/shipping document", async () => {
    const prisma = makePrisma();
    prisma.trade.count.mockResolvedValue(1);
    prisma.trade.findMany.mockImplementation((args) =>
      Promise.resolve(
        isHead(args)
          ? [{ id: "t1", cancelledAt: at("2026-10-05T00:00:00.000Z") }]
          : [tradeRow("t1", "2026-10-05T00:00:00.000Z")],
      ),
    );
    prisma.fiscalInvoice.findMany.mockImplementation((args) =>
      Promise.resolve(
        args.where.type === "return_invoice"
          ? [
              {
                id: "ret-t",
                sourceId: "fee-1",
                invoiceNumber: "TRD2026000000002",
                status: "signed",
                createdAt: at("2026-10-06T00:00:00.000Z"),
              },
            ]
          : [{ id: "fee-1", sourceId: "cp-t1" }],
      ),
    );

    const page = await service(prisma).list({ tab: "trade" });

    expect(prisma.fiscalInvoice.findMany.mock.calls[0][0].where).toEqual({
      type: { in: ["trade_commission", "trade_service_fee", "trade_shipping"] },
      sourceId: { in: ["cp-t1"] },
    });
    expect(page.data[0].returnInvoice?.id).toBe("ret-t");
    expect(page.data[1].returnInvoice).toBeNull();
  });
});

describe("AdminRefundListService.counts", () => {
  it("counts every bucket of the tab with the list's where, trades twice", async () => {
    const prisma = makePrisma();
    prisma.refundAttempt.findMany.mockResolvedValue([
      { idempotencyKey: "refund-request:rr-1" },
    ]);
    prisma.refundRequest.count.mockResolvedValue(3);
    prisma.trade.count.mockResolvedValue(1);

    const counts = await service(prisma).counts({ tab: "all", search: "x" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(Object.keys(counts)).toEqual([...ADMIN_REFUND_BUCKETS]);
    expect(counts.all).toBe(5);
    const ctx = { inFlightRequestIds: ["rr-1"] };
    for (const bucket of ADMIN_REFUND_BUCKETS) {
      const wheres = refundListSourceWheres(
        "all",
        bucket,
        { search: "x" },
        ctx,
      );
      expect(prisma.refundRequest.count).toHaveBeenCalledWith({
        where: wheres.request,
      });
      expect(prisma.trade.count).toHaveBeenCalledWith({ where: wheres.trade });
    }
  });

  it("a request-only tab never counts trades", async () => {
    const prisma = makePrisma();
    prisma.refundRequest.count.mockResolvedValue(2);

    const counts = await service(prisma).counts({ tab: "offer" });

    expect(prisma.trade.count).not.toHaveBeenCalled();
    expect(counts.pending_review).toBe(2);
  });
});

describe("AdminRefundListService.export", () => {
  function setup(pages: unknown[][]) {
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new AdminRefundListService(
      {} as never,
      new ExportListService(audit as never),
    );
    const list = jest.spyOn(svc, "list").mockImplementation(async (query) => ({
      data: (pages[(query.page ?? 1) - 1] ?? []) as never,
      meta: { total: 0, page: query.page ?? 1, limit: 0, totalPages: 0 },
    }));
    return { svc, list, audit };
  }

  it("reads the list with the same tab/bucket/filters at the largest page size", async () => {
    const { svc, list } = setup([[]]);
    const query = { tab: "trade", bucket: "refunding", sortOrder: "asc" as const };

    const file = await svc.export(query, "admin-1", "tr");

    expect(list).toHaveBeenCalledWith({ ...query, page: 1, limit: 500 });
    expect(file.filename).toMatch(/^iadeler-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("leaves a required audit record without the search term", async () => {
    const { svc, audit } = setup([[]]);

    await svc.export({ search: "ahmet@ornek.com", kind: "return" }, "admin-1", "tr");

    const [actor, action, entityType, , , payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType]).toEqual([
      "admin-1",
      "refund_requests_export",
      "RefundRequest",
    ]);
    expect(JSON.stringify(payload)).not.toContain("ahmet@ornek.com");
    expect(payload.resource).toBe("refundRequests");
    expect(payload.filters).toMatchObject({
      kind: "return",
      searchApplied: true,
    });
  });
});
