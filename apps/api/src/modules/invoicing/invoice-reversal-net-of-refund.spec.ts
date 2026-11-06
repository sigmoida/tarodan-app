import type { ConfigService } from "@nestjs/config";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceDocumentService } from "./invoice-document.service";
import { InvoiceIssuingService } from "./invoice-issuing.service";
import { InvoiceReversalService } from "./invoice-reversal.service";
import { formatInvoiceCancelClaim } from "./helpers/invoice-cancel-claim";
import type {
  EInvoiceCancelResult,
  EInvoiceProvider,
  EInvoiceStatus,
  FiscalDocumentInput,
} from "./provider/e-invoice-provider";
import type { InvoiceRefundReversePayload } from "../outbox/outbox.types";

/**
 * A document cut NET of an early refund must not be reversed again when that
 * refund's late event is handled, and two handlers of one refund (the
 * post-commit fast path and the outbox drainer), or a cancel and another
 * attempt's return, must never both reverse a document.
 *
 * QA reproduced on a real database: a `platform_sale` document cut at
 * 240.00, net of an early 160.00 refund of a 400.00 order; the refund's late
 * event then cut a 160.00 return. The real issuing and reversal services run
 * here on an in-memory store; the integrator is a fake.
 */

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

interface Seed {
  orders?: Record<string, Record<string, unknown>>;
  payments?: Record<string, Record<string, unknown>>;
  attempts?: Record<string, Record<string, unknown>>;
  users?: Record<string, Record<string, unknown>>;
  packages?: Record<string, Record<string, unknown>>;
  ledgers?: Record<string, Record<string, unknown>>;
  refundRequests?: Record<string, Record<string, unknown>>;
  shippingRefunds?: Array<{
    orderId: string;
    refundRequestId: string;
    netAmount: number;
    refundedAt: Date | null;
  }>;
}

function matches(row: Row, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("not" in c && value === c.not) return false;
      if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
      if ("lt" in c && !((value as number) < (c.lt as number))) return false;
      continue;
    }
    if (cond === undefined) continue;
    if ((value ?? null) !== (cond ?? null)) return false;
  }
  return true;
}

function apply(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      row[key] =
        Number(row[key] ?? 0) +
        Number((value as { increment: number }).increment);
    } else if (value !== undefined) {
      row[key] = value;
    }
  }
}

function makeStore(seed: Seed) {
  const invoices: Row[] = [];
  let seq = 0;
  let ids = 0;
  const byTypeSource = (w: { type: string; sourceId: string }) =>
    invoices.find((i) => i.type === w.type && i.sourceId === w.sourceId) ??
    null;
  const store = {
    invoices,
    fiscalInvoice: {
      findUnique: jest.fn(async ({ where }: { where: Where }) => {
        if (where.id) return invoices.find((i) => i.id === where.id) ?? null;
        return byTypeSource(
          where.type_sourceId as { type: string; sourceId: string },
        );
      }),
      findFirst: jest.fn(
        async ({ where }: { where: Where }) =>
          invoices.find((i) => matches(i, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        invoices.filter((i) => matches(i, where)),
      ),
      count: jest.fn(
        async ({ where }: { where: Where }) =>
          invoices.filter((i) => matches(i, where)).length,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          id: `inv-${++ids}`,
          attemptCount: 0,
          cancelReason: null,
          refundAdjustedAt: null,
          createdAt: new Date(),
          ...data,
        };
        invoices.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = invoices.find((i) => i.id === where.id);
          if (!row) throw new Error("not found");
          apply(row, data);
          return row;
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Where;
          data: Record<string, unknown>;
        }) => {
          const rows = invoices.filter((i) => matches(i, where));
          rows.forEach((row) => apply(row, data));
          return { count: rows.length };
        },
      ),
    },
    fiscalDocSequence: {
      upsert: jest.fn(async () => ({ lastValue: ++seq })),
    },
    order: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const order = seed.orders?.[where.id];
        return order ? { id: where.id, ...order } : null;
      }),
      count: jest.fn(async () => 0),
    },
    orderPackage: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const pkg = seed.packages?.[where.id];
        if (!pkg) return null;
        const orderIds = (pkg.orderIds as string[]) ?? [];
        return {
          ...pkg,
          orders: orderIds.map((id) => ({
            id,
            ...seed.orders?.[id],
            commissionLedger: seed.ledgers?.[id] ?? null,
          })),
        };
      }),
    },
    commissionLedger: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        ((where.orderId as { in: string[] }).in ?? [])
          .map((id) => seed.ledgers?.[id])
          .filter(Boolean),
      ),
    },
    payment: {
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const or = (where.OR as Array<{ orderId?: string }>) ?? [where];
        for (const branch of or) {
          const payment = branch.orderId
            ? seed.payments?.[branch.orderId]
            : undefined;
          if (payment) return payment;
        }
        return null;
      }),
    },
    refundAttempt: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          seed.attempts?.[where.id] ?? null,
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            orderId: { in: string[] };
            status: string;
            idempotencyKey: { startsWith: string };
          };
        }) =>
          Object.values(seed.attempts ?? {}).filter(
            (a) =>
              where.orderId.in.includes(String(a.orderId)) &&
              a.status === where.status &&
              String(a.idempotencyKey ?? "").startsWith(
                where.idempotencyKey.startsWith,
              ),
          ),
      ),
    },
    refundRequest: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          seed.refundRequests?.[where.id] ?? null,
      ),
    },
    refundFinancialComponent: {
      findFirst: jest.fn(async ({ where }: { where: Where }) => {
        const request = seed.refundRequests?.[where.refundRequestId as string];
        const components =
          (request?.financialComponents as Array<Record<string, unknown>>) ??
          [];
        return (
          components.find(
            (c) =>
              c.componentCode === where.componentCode &&
              c.treatment === where.treatment,
          ) ?? null
        );
      }),
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        const filter = where.refundRequest as {
          orderId: { in: string[] };
          OR?: Array<{ refundedAt?: unknown; id?: { in: string[] } }>;
          refundedAt?: unknown;
        };
        const forced = filter.OR?.find((b) => b.id)?.id?.in ?? [];
        return (seed.shippingRefunds ?? [])
          .filter((r) => filter.orderId.in.includes(r.orderId))
          .filter(
            (r) => r.refundedAt !== null || forced.includes(r.refundRequestId),
          )
          .map((r) => ({ netAmount: r.netAmount }));
      }),
    },
    productBoost: { findUnique: jest.fn(async () => null) },
    membershipPayment: { findFirst: jest.fn(async () => null) },
    user: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          seed.users?.[where.id] ?? null,
      ),
    },
    address: { findFirst: jest.fn(async () => null) },
  };
  const $transaction = jest.fn(
    async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      fn(withTx),
  );
  const withTx: typeof store & { $transaction: typeof $transaction } = {
    ...store,
    $transaction,
  };
  return withTx;
}

function makeProvider() {
  const sent: FiscalDocumentInput[] = [];
  const cancels: string[] = [];
  const state = {
    cancel: async (): Promise<EInvoiceCancelResult> => ({ success: true }),
    status: async (): Promise<EInvoiceStatus> => ({ state: "unknown" }),
    strategy: "CANCEL" as "CANCEL" | "RETURN_INVOICE",
  };
  const provider: EInvoiceProvider = {
    name: "elogo",
    numbering: "local",
    isEnabled: () => true,
    resolveRecipientKind: async () => ({ kind: "EARCHIVE" }),
    send: async (document: FiscalDocumentInput) => {
      sent.push(document);
      return { accepted: true, providerRef: `ref-${sent.length}` };
    },
    getStatus: async () => state.status(),
    cancelEArchive: async (ref: { ettn: string }) => {
      cancels.push(ref.ettn);
      return state.cancel();
    },
    fetchPdf: async () => null,
    eArchiveReversalStrategy: () => state.strategy,
    classifyError: () => "unknown",
  } as unknown as EInvoiceProvider;
  return { provider, sent, cancels, state };
}

/** Mutable per test: a rate change between the cut and a late event. */
function makeConfig() {
  const values: Record<string, string> = {
    ELOGO_VAT_RATE: "20",
    ELOGO_INVOICE_PREFIX: "TRD",
  };
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;
  return { config, values };
}

function build(seed: Seed) {
  const { config, values } = makeConfig();
  const store = makeStore(seed);
  const { provider, sent, cancels, state } = makeProvider();
  const prisma = store as never;
  const documents = new InvoiceDocumentService(prisma, provider, config);
  const delivery = new InvoiceDeliveryService(prisma, provider, documents);
  const issuing = new InvoiceIssuingService(prisma, documents, delivery);
  const reversals = new InvoiceReversalService(
    prisma,
    provider,
    documents,
    delivery,
  );
  const returns = () =>
    store.invoices.filter((i) => i.type === "return_invoice");
  const returned = () =>
    returns().reduce((sum, row) => sum + Number(row.total), 0);
  return {
    store,
    sent,
    cancels,
    state,
    issuing,
    reversals,
    returns,
    returned,
    config: values,
  };
}

const finalizedAt = new Date("2026-11-01T10:00:00Z");

/**
 * The platform sells its own product: 400.00 = 300.00 product (VAT 20 %
 * inside) + 50.00 shipping + 33.33 buyer fee (VAT 20 % on top).
 */
function platformSale(): Seed {
  return {
    orders: {
      o1: {
        sellerId: "plat",
        buyerId: "b1",
        orderNumber: "ORD-0001",
        totalAmount: 400,
        subtotal: 300,
        quantity: 1,
        buyerShippingAmount: 50,
        buyerFeeAmount: 33.33,
        checkoutGroupId: null,
        packageId: null,
        product: { title: "Diecast 1:18", categoryId: null },
      },
    },
    payments: {
      o1: {
        metadata: {
          refundedOrders: {},
        },
      },
    },
    attempts: {
      ra1: { id: "ra1", orderId: "o1", status: "finalized", finalizedAt },
      ra2: { id: "ra2", orderId: "o1", status: "finalized", finalizedAt },
    },
    users: {
      plat: { displayName: "Tarodan Official Store", sellerType: "platform" },
      b1: { displayName: "Alıcı", taxId: null },
    },
  };
}

/** Records a finalized refund of `amount` on the order (refundedOrders). */
function refund(seed: Seed, amount: number) {
  const meta = seed.payments!.o1.metadata as {
    refundedOrders: Record<string, number>;
  };
  meta.refundedOrders.o1 = (meta.refundedOrders.o1 ?? 0) + amount;
}

const event = (
  refundAttemptId: string,
  refundRatio: number,
  fullyRefunded = false,
): InvoiceRefundReversePayload => ({
  orderId: "o1",
  refundAttemptId,
  refundRatio,
  fullyRefunded,
});

describe("reversal of a document cut net of a refund", () => {
  it("does not reverse a platform_sale cut at 240.00 net of an early 160.00 refund again on its late event", async () => {
    const seed = platformSale();
    refund(seed, 160);
    const t = build(seed);

    await t.issuing.issuePlatformSaleInvoice("o1");
    const doc = t.store.invoices[0];
    expect([doc.type, doc.status, Number(doc.total)]).toEqual([
      "platform_sale",
      "sent",
      240,
    ]);

    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    // A replay of the same event (the outbox drainer after the fast path).
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns()).toHaveLength(0);
    expect(t.cancels).toHaveLength(0);
    expect(doc.status).toBe("sent");
  });

  it("reverses 160.00 of a platform_sale cut at 400.00 before the refund, once", async () => {
    const seed = platformSale();
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");
    expect(Number(t.store.invoices[0].total)).toBe(400);

    refund(seed, 160);
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns().map((r) => Number(r.total))).toEqual([160]);
    expect(t.returns()[0].sourceId).toBe(`${t.store.invoices[0].id}:ra1`);
  });

  it("takes a document cut net of one refund down to what it should carry after a second one (240 -> 140)", async () => {
    const seed = platformSale();
    refund(seed, 160);
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");

    refund(seed, 100);
    // The early refund's event arrives last; the second refund's first.
    await t.reversals.handleOrderRefund("o1", event("ra2", 0.25));
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returned()).toBeCloseTo(100, 2);
    expect(Number(t.store.invoices[0].total) - t.returned()).toBeCloseTo(
      140,
      2,
    );
  });

  it("cancels a platform_sale on its closing full refund and cuts no return next to it", async () => {
    const seed = platformSale();
    refund(seed, 160);
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");

    refund(seed, 240);
    await t.reversals.handleOrderRefund("o1", event("ra2", 0.6, true));
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.cancels).toHaveLength(1);
    expect(t.store.invoices[0].status).toBe("cancelled");
    expect(t.returns()).toHaveLength(0);
  });

  it("compares at the rates the document was cut with: a later VAT change is no refund", async () => {
    const seed = platformSale();
    refund(seed, 160);
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");
    expect(Number(t.store.invoices[0].total)).toBe(240);

    t.config.ELOGO_VAT_RATE = "10";
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns()).toHaveLength(0);
  });

  it("reprices an unsent platform_sale with its lines, so it is sent at the net amount", async () => {
    const seed = platformSale();
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    // The integrator was down at the cut: the document stays pending.
    t.store.fiscalInvoice.updateMany.mockImplementationOnce(async () => ({
      count: 0,
    }));
    await t.issuing.issuePlatformSaleInvoice("o1");
    const doc = t.store.invoices[0];
    expect(doc.status).toBe("pending");

    refund(seed, 160);
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    expect(Number(doc.total)).toBe(240);

    // Retry sends it: the sent document carries 240.00, not the stale 400.00.
    doc.attemptCount = 0;
    await t.issuing.issuePlatformSaleInvoice("o1");
    expect(doc.status).toBe("sent");
    expect(Number(doc.total)).toBe(240);
    // The second handler of the same refund finds nothing to reverse.
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    expect(t.returns()).toHaveLength(0);
  });
});

/**
 * A package of one order: buyer commission 50.00 (VAT 20 % on top), refunded
 * 20.00 by the early refund request rr1 before delivery.
 */
function packageSeed(): Seed {
  return {
    orders: {
      o1: {
        sellerId: "s1",
        buyerId: "b1",
        packageId: "p1",
        buyerShippingAmount: 0,
        sellerShippingAmount: 0,
        feeDiscountBreakdown: null,
        shippingAddress: null,
      },
    },
    packages: {
      p1: {
        sellerId: "s1",
        buyerId: "b1",
        packageNumber: "PKG-0001",
        orderIds: ["o1"],
      },
    },
    ledgers: {
      o1: {
        componentBreakdownComplete: true,
        sellerCommission: 0,
        refundedSellerCommission: 0,
        buyerFee: 50,
        refundedBuyerFee: 20,
        buyerCommissionAmount: 50,
        buyerPlatformFeeAmount: 0,
        sellerCommissionAmount: 0,
        sellerPlatformFeeAmount: 0,
        refundedBuyerCommissionAmount: 20,
        refundedBuyerPlatformFeeAmount: 0,
        refundedSellerCommissionAmount: 0,
        refundedSellerPlatformFeeAmount: 0,
      },
    },
    payments: { o1: { metadata: {} } },
    attempts: {
      ra1: {
        id: "ra1",
        orderId: "o1",
        status: "finalized",
        finalizedAt,
        idempotencyKey: "refund-request:rr1",
      },
    },
    refundRequests: {
      rr1: {
        refundQuantity: 1,
        financialComponents: [
          {
            componentCode: "buyer_commission",
            treatment: "buyer_refund",
            netAmount: 20,
            taxAmount: 4,
          },
        ],
      },
    },
    users: {
      s1: { displayName: "Satıcı", taxId: null },
      b1: { displayName: "Alıcı", taxId: null },
    },
  };
}

describe("reversal of a package fee document cut net of a refund", () => {
  it("does not reverse a buyer_commission cut at 36.00 net of a 20.00 refund again on its late event", async () => {
    const t = build(packageSeed());
    await t.issuing.issuePackageFeeInvoices("p1");
    const doc = t.store.invoices.find((i) => i.type === "buyer_commission");
    expect(Number(doc?.total)).toBe(36);

    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns()).toHaveLength(0);
    expect(t.cancels).toHaveLength(0);
  });

  it("reverses 24.00 of a buyer_commission cut at 60.00 before the refund", async () => {
    const seed = packageSeed();
    const ledger = seed.ledgers!.o1;
    ledger.refundedBuyerCommissionAmount = 0;
    ledger.refundedBuyerFee = 0;
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issuePackageFeeInvoices("p1");
    expect(Number(t.store.invoices[0].total)).toBe(60);

    ledger.refundedBuyerCommissionAmount = 20;
    ledger.refundedBuyerFee = 20;
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns().map((r) => Number(r.total))).toEqual([24]);
  });
});

describe("documents without a target keep the earlier rules", () => {
  /** A membership bought as a MEM- order of 100.00, refunded 40.00. */
  function membership(): Seed {
    return {
      orders: {
        o1: {
          buyerId: "b1",
          totalAmount: 100,
          productId: "membership-pro",
          checkoutGroupId: null,
          packageId: null,
        },
      },
      payments: { o1: { metadata: { refundedOrders: {} } } },
      attempts: {
        ra1: { id: "ra1", orderId: "o1", status: "finalized", finalizedAt },
      },
      users: { b1: { displayName: "Üye", taxId: null } },
    };
  }

  it("does not reverse a membership repriced while unsent again on the second handler of its refund", async () => {
    const seed = membership();
    const t = build(seed);
    t.store.fiscalInvoice.updateMany.mockImplementationOnce(async () => ({
      count: 0,
    }));
    await t.issuing.issueMembershipInvoiceForOrder("o1");
    const doc = t.store.invoices[0];
    expect(doc.status).toBe("pending");

    (
      seed.payments!.o1.metadata as { refundedOrders: Record<string, number> }
    ).refundedOrders.o1 = 40;
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    expect(Number(doc.total)).toBe(60);
    expect(doc.refundAdjustedAt).toEqual(finalizedAt);

    doc.attemptCount = 0;
    await t.issuing.issueMembershipInvoiceForOrder("o1");
    expect(doc.status).toBe("sent");
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns()).toHaveLength(0);
  });

  it("reverses a sent membership by the refund ratio", async () => {
    const seed = membership();
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issueMembershipInvoiceForOrder("o1");

    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));

    expect(t.returns().map((r) => Number(r.total))).toEqual([40]);
  });
});

describe("package shipping documents", () => {
  /** One order whose buyer paid 25.00 of shipping (VAT 20 % on top). */
  function shippingSeed(refundedAt: Date | null): Seed {
    const seed = packageSeed();
    seed.orders!.o1.buyerShippingAmount = 25;
    seed.orders!.o1.sellerShippingAmount = 10;
    const ledger = seed.ledgers!.o1;
    ledger.buyerCommissionAmount = 0;
    ledger.refundedBuyerCommissionAmount = 0;
    ledger.buyerFee = 0;
    ledger.refundedBuyerFee = 0;
    seed.refundRequests!.rr1.financialComponents = [
      {
        componentCode: "outbound_shipping",
        treatment: "buyer_refund",
        netAmount: 25,
        taxAmount: 5,
      },
    ];
    seed.shippingRefunds = [
      { orderId: "o1", refundRequestId: "rr1", netAmount: 25, refundedAt },
    ];
    return seed;
  }

  it("reverses the buyer shipping on the refund's fast path, before the request is stamped refunded", async () => {
    const seed = shippingSeed(null);
    // Cut before the refund: nothing was refunded then.
    seed.shippingRefunds = [];
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issuePackageFeeInvoices("p1");
    expect(
      Number(t.store.invoices.find((i) => i.type === "buyer_shipping")?.total),
    ).toBe(30);

    // The refund committed; `refundedAt` is stamped a moment later.
    seed.shippingRefunds = [
      {
        orderId: "o1",
        refundRequestId: "rr1",
        netAmount: 25,
        refundedAt: null,
      },
    ];
    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    const doc = t.store.invoices.find((i) => i.type === "buyer_shipping");
    const ret = t
      .returns()
      .filter((r) => r.billingReference === doc?.invoiceNumber);
    expect(ret.map((r) => Number(r.total))).toEqual([30]);
  });

  it("counts a sibling refund request as refunded once its attempt is finalized, even before its stamp", async () => {
    const seed = shippingSeed(null);
    seed.orders!.o1.buyerShippingAmount = 50;
    seed.shippingRefunds = [];
    seed.attempts!.ra2 = {
      id: "ra2",
      orderId: "o1",
      status: "finalized",
      finalizedAt,
      idempotencyKey: "refund-request:rr2",
    };
    seed.refundRequests!.rr2 = {
      refundQuantity: 1,
      financialComponents: [
        {
          componentCode: "outbound_shipping",
          treatment: "buyer_refund",
          netAmount: 12.5,
          taxAmount: 2.5,
        },
      ],
    };
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issuePackageFeeInvoices("p1");
    const doc = t.store.invoices.find((i) => i.type === "buyer_shipping");
    expect(Number(doc?.total)).toBe(60);

    // Both refunds committed; neither request is stamped `refundedAt` yet.
    seed.shippingRefunds = [
      {
        orderId: "o1",
        refundRequestId: "rr1",
        netAmount: 25,
        refundedAt: null,
      },
      {
        orderId: "o1",
        refundRequestId: "rr2",
        netAmount: 12.5,
        refundedAt: null,
      },
    ];
    await t.reversals.handleOrderRefund("o1", event("ra2", 0.25));
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.5));

    const ret = t
      .returns()
      .filter((r) => r.billingReference === doc?.invoiceNumber);
    expect(ret.map((r) => Number(r.total)).sort()).toEqual([15, 30]);
  });

  it("keeps reversing the buyer shipping by the refund ratio on a refund without a refund request", async () => {
    const seed = shippingSeed(null);
    seed.shippingRefunds = [];
    seed.attempts!.ra1.idempotencyKey = "admin-refund-1";
    const t = build(seed);
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issuePackageFeeInvoices("p1");
    const doc = t.store.invoices.find((i) => i.type === "buyer_shipping");
    expect(Number(doc?.total)).toBe(30);

    await t.reversals.handleOrderRefund("o1", event("ra1", 0.5));

    const ret = t
      .returns()
      .filter((r) => r.billingReference === doc?.invoiceNumber);
    expect(ret.map((r) => Number(r.total))).toEqual([15]);
  });

  it("keeps reversing the seller shipping share by the refund ratio (its amount never follows a refund)", async () => {
    const t = build(shippingSeed(new Date()));
    t.state.strategy = "RETURN_INVOICE";
    await t.issuing.issuePackageFeeInvoices("p1");
    const doc = t.store.invoices.find((i) => i.type === "seller_shipping");
    expect(Number(doc?.total)).toBe(12);

    await t.reversals.handleOrderRefund("o1", event("ra1", 0.5));

    const ret = t
      .returns()
      .filter((r) => r.billingReference === doc?.invoiceNumber);
    expect(ret.map((r) => Number(r.total))).toEqual([6]);
  });
});

describe("cancel claim of a generic document", () => {
  /** A 400.00 platform_sale cut before any refund, fully refunded now. */
  async function fullyRefunded() {
    const seed = platformSale();
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");
    refund(seed, 400);
    return { t, doc: t.store.invoices[0] };
  }

  it("lets one of two handlers of the same refund cancel; the other backs off and cuts no return", async () => {
    const { t, doc } = await fullyRefunded();
    let second: Promise<void> | null = null;
    let calls = 0;
    t.state.cancel = async () => {
      calls++;
      if (calls === 1) {
        // The outbox drainer runs while the fast path waits on eLogo.
        second = t.reversals.handleOrderRefund("o1", event("ra1", 1, true));
        await second.catch(() => undefined);
        return { success: true };
      }
      // eLogo refuses a second cancel of the same document.
      return { success: false, resultMsg: "already cancelled" };
    };

    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    await expect(second).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
    expect(calls).toBe(1);
    expect(doc.status).toBe("cancelled");
    expect(t.returns()).toHaveLength(0);
  });

  it("keeps another attempt's return off a document being cancelled", async () => {
    const seed = platformSale();
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");
    refund(seed, 160);
    refund(seed, 240);
    let partial: Promise<void> | null = null;
    t.state.cancel = async () => {
      partial = t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
      await partial.catch(() => undefined);
      return { success: true };
    };

    await t.reversals.handleOrderRefund("o1", event("ra2", 0.6, true));

    await expect(partial).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
    expect(t.store.invoices[0].status).toBe("cancelled");
    expect(t.returns()).toHaveLength(0);
    // The retried event finds the document cancelled: nothing more.
    await t.reversals.handleOrderRefund("o1", event("ra1", 0.4));
    expect(t.returns()).toHaveLength(0);
  });

  it("cancels a fully refunded document even when the refund's component lines fall a kuruş short", async () => {
    const seed = platformSale();
    const t = build(seed);
    await t.issuing.issuePlatformSaleInvoice("o1");
    refund(seed, 400);
    seed.attempts!.ra1.idempotencyKey = "refund-request:rr9";
    seed.refundRequests = {
      rr9: {
        refundQuantity: 1,
        financialComponents: [
          {
            componentCode: "product",
            treatment: "buyer_refund",
            netAmount: 333.32,
            taxAmount: 66.67,
          },
        ],
      },
    };

    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    expect(t.cancels).toHaveLength(1);
    expect(t.store.invoices[0].status).toBe("cancelled");
    expect(t.returns()).toHaveLength(0);
  });

  it("marks a document cancelled by eLogo even after its claim was lost, and raises the alarm", async () => {
    const { t, doc } = await fullyRefunded();
    t.state.cancel = async () => {
      // The cancel outlived its lease and another run took the claim over.
      doc.cancelReason = formatInvoiceCancelClaim("other", new Date());
      return { success: true };
    };
    const alarm = jest.spyOn(
      (t.reversals as unknown as { logger: { error: () => void } }).logger,
      "error",
    );

    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    expect(doc.status).toBe("cancelled");
    expect(alarm).toHaveBeenCalledWith(
      expect.stringContaining("INVOICE_CANCEL_CLAIM_LOST"),
    );
  });

  it("falls back to one closing return when eLogo refuses the cancel, and releases the claim", async () => {
    const { t, doc } = await fullyRefunded();
    t.state.cancel = async () => ({ success: false, resultMsg: "refused" });
    t.state.status = async () => ({ state: "completed" });

    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));
    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    expect(doc.status).toBe("sent");
    expect(doc.cancelReason).toBe("refund");
    expect(t.returns().map((r) => Number(r.total))).toEqual([400]);
  });

  it("leaves the claim when the cancel outcome is unknown, and settles it from eLogo once stale", async () => {
    const { t, doc } = await fullyRefunded();
    t.state.cancel = async () => {
      throw new Error("socket hang up");
    };

    await expect(
      t.reversals.handleOrderRefund("o1", event("ra1", 1, true)),
    ).rejects.toThrow(/INVOICE_CANCEL_OUTCOME_UNKNOWN/);
    expect(String(doc.cancelReason)).toMatch(/^refund_cancelling:/);
    // Within the lease: another run backs off.
    await expect(
      t.reversals.handleOrderRefund("o1", event("ra1", 1, true)),
    ).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);

    // Stale, and eLogo says it was cancelled after all.
    doc.cancelReason = formatInvoiceCancelClaim("old", new Date(0));
    t.state.status = async () => ({ state: "cancelled" });
    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    expect(doc.status).toBe("cancelled");
    expect(t.returns()).toHaveLength(0);
  });

  it("clears a stale claim of a standing document and reverses it normally", async () => {
    const { t, doc } = await fullyRefunded();
    doc.cancelReason = formatInvoiceCancelClaim("old", new Date(0));
    t.state.status = async () => ({ state: "completed" });
    t.state.strategy = "RETURN_INVOICE";

    await t.reversals.handleOrderRefund("o1", event("ra1", 1, true));

    expect(doc.cancelReason).toBeNull();
    expect(t.returns().map((r) => Number(r.total))).toEqual([400]);
  });
});
