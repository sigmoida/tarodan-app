import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { InvoiceReversalService } from "./invoice-reversal.service";
import {
  formatInvoiceCancelClaim,
  INVOICE_CANCEL_LEASE_MS,
} from "./helpers/invoice-cancel-claim";
import type {
  InstallmentFeeBasis,
  InvoiceDocumentService,
} from "./invoice-document.service";
import type { InvoiceDeliveryService } from "./invoice-delivery.service";
import type { EInvoiceProvider } from "./provider/e-invoice-provider";

/**
 * Reversal of the buyer's installment fee document (ADR 0019, AS-F3): each
 * finalized refund attempt reverses ITS fee share
 * (`RefundAttempt.installmentFeeAmount`), never the goods ratio of the
 * refund; repeated and out-of-order refund events stay idempotent; an
 * unsent document is repriced; a full refund of a fresh e-Arşiv cancels it.
 *
 * Amounts: one order of 1,000.00 TL at 3 installments, F = 66.38
 * (55.32 + 11.06 VAT), refunded 400.00 then 600.00 of goods: fee shares
 * 26.55 then 39.83 (plan 4.4).
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const OLD = new Date("2026-10-01T10:00:00Z");

/** A stored row of the fake: the columns the reversal reads and writes. */
type Row = { id: string; [column: string]: unknown };

interface Where {
  id?: string;
  type?: string;
  billingReference?: string;
  status?: { not?: string };
  type_sourceId?: { type: string; sourceId: string };
}

interface Store {
  invoices: Row[];
  attempts: Record<string, Row>;
  /** The package's fee after the finalized refunds so far, by package. */
  refundedFee: Record<string, number>;
  feeOf: Record<string, number>;
  paymentFeeFullyRefunded: boolean;
  paymentPackageIds: string[];
}

function sentFeeInvoice(over: Partial<Row> = {}): Row {
  return {
    id: "fee-1",
    type: "buyer_installment_fee",
    sourceId: "pkg1",
    status: "sent",
    invoiceNumber: "TRD2026000000001",
    ettn: "ettn-1",
    providerRef: null,
    issuedAt: OLD,
    createdAt: OLD,
    documentType: "EARCHIVE",
    recipientUserId: "b1",
    recipientVknTckn: "11111111111",
    recipientName: "Ayşe Yılmaz",
    recipientEmail: "ayse@example.test",
    recipientCity: null,
    recipientDistrict: null,
    recipientStreet: null,
    netAmount: D("55.32"),
    taxAmount: D("11.06"),
    total: D("66.38"),
    originalTotal: D("66.38"),
    vatRate: D("20.00"),
    sourceReference: "KYT-K7X9M2QF3N",
    lineDescription: null,
    refundAdjustedAt: null,
    attemptCount: 1,
    ...over,
  };
}

function makeService(
  initial: Partial<Store> & {
    strategy?: "CANCEL" | "RETURN_INVOICE";
    orderPackage?: Record<string, string>;
  } = {},
) {
  const store: Store = {
    invoices: initial.invoices ?? [sentFeeInvoice()],
    attempts: initial.attempts ?? {},
    refundedFee: initial.refundedFee ?? {},
    feeOf: initial.feeOf ?? { pkg1: 66.38 },
    paymentFeeFullyRefunded: initial.paymentFeeFullyRefunded ?? false,
    paymentPackageIds: initial.paymentPackageIds ?? [],
  };
  const orderPackage = initial.orderPackage ?? { o1: "pkg1" };
  let seq = 1;
  let ids = 0;

  const matches = (row: Row, where: Where) =>
    (where.type === undefined || row.type === where.type) &&
    (where.billingReference === undefined ||
      row.billingReference === where.billingReference) &&
    (where.status?.not === undefined || row.status !== where.status.not);

  const fiscalInvoice = {
    findUnique: jest.fn(async ({ where }: { where: Where }) =>
      where.id
        ? (store.invoices.find((i) => i.id === where.id) ?? null)
        : (store.invoices.find(
            (i) =>
              i.type === where.type_sourceId?.type &&
              i.sourceId === where.type_sourceId?.sourceId,
          ) ?? null),
    ),
    findMany: jest.fn(async ({ where }: { where: Where }) =>
      store.invoices.filter((i) => matches(i, where)),
    ),
    update: jest.fn(
      async ({ where, data }: { where: Where; data: Partial<Row> }) => {
        const row = store.invoices.find((i) => i.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
    ),
    count: jest.fn(
      async ({ where }: { where: Where }) =>
        store.invoices.filter((i) => matches(i, where)).length,
    ),
    // Compare-and-set on `cancelReason` (the cancel claim and its release).
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; cancelReason?: string | null };
        data: Partial<Row>;
      }) => {
        const row = store.invoices.find(
          (i) =>
            i.id === where.id &&
            (!("cancelReason" in where) ||
              (i.cancelReason ?? null) === where.cancelReason),
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    ),
    create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
      const row = { id: `ret-${++ids}`, ...data };
      store.invoices.push(row);
      return row;
    }),
  };
  const prisma = {
    fiscalInvoice,
    refundAttempt: {
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          store.attempts[where.id] ?? null,
      ),
    },
    order: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({
        packageId: orderPackage[where.id] ?? null,
      })),
    },
    productBoost: { findUnique: jest.fn(async () => null) },
    payment: { findFirst: jest.fn(async () => null) },
    membershipPayment: { findFirst: jest.fn(async () => null) },
  };
  // The transaction runs on the same store (one Serializable writer here).
  const db = {
    ...prisma,
    $transaction: jest.fn(
      async (fn: (tx: typeof prisma) => Promise<unknown>): Promise<unknown> =>
        fn(prisma),
    ),
  };

  const documents = {
    round2: (n: number) => Math.round((n + Number.EPSILON) * 100) / 100,
    allocateDocumentNumberInTransaction: jest.fn(
      async () => `TRD2026${String(++seq).padStart(9, "0")}`,
    ),
    resolveInstallmentFeeBasis: jest.fn(
      async (packageId: string): Promise<InstallmentFeeBasis | null> => {
        const fee = store.feeOf[packageId];
        if (!fee) return null;
        return {
          buyerId: "b1",
          packageNumber: "PKG-K7X9M2QF3N",
          shippingAddress: null,
          // The package's fee and refunds sit on its first order.
          orders: Object.entries(orderPackage)
            .filter(([, pkg]) => pkg === packageId)
            .map(([orderId], i) => ({
              id: orderId,
              fee: i === 0 ? fee : 0,
              refundedFee: i === 0 ? (store.refundedFee[packageId] ?? 0) : 0,
            })),
          paymentFeeFullyRefunded: store.paymentFeeFullyRefunded,
          vatRatePct: 20,
        };
      },
    ),
    installmentFeeSweepPackageIds: jest.fn(async (orderId: string) =>
      store.paymentFeeFullyRefunded
        ? store.paymentPackageIds.filter((p) => p !== orderPackage[orderId])
        : [],
    ),
  };
  const provider = {
    name: "elogo",
    eArchiveReversalStrategy: jest.fn(
      () => initial.strategy ?? "RETURN_INVOICE",
    ),
    cancelEArchive: jest.fn(async () => ({ success: true, resultMsg: "OK" })),
    getStatus: jest.fn(async () => null),
  };
  const sendRecord = jest.fn(async (id: string) => {
    const row = store.invoices.find((i) => i.id === id);
    if (row) Object.assign(row, { status: "sent", issuedAt: new Date() });
  });

  const service = new InvoiceReversalService(
    db as never,
    provider as unknown as EInvoiceProvider,
    documents as unknown as InvoiceDocumentService,
    { sendRecord } as unknown as InvoiceDeliveryService,
  );

  /** A finalized refund attempt of `orderId` that gave back `fee`. */
  const refund = (id: string, orderId: string, fee: number, ratio = 0.4) => {
    store.attempts[id] = {
      id,
      orderId,
      status: "finalized",
      finalizedAt: new Date(),
      idempotencyKey: `refund:${id}`,
      installmentFeeAmount: D(fee),
    };
    const pkg = orderPackage[orderId];
    store.refundedFee[pkg] =
      Math.round(((store.refundedFee[pkg] ?? 0) + fee) * 100) / 100;
    return {
      orderId,
      refundAttemptId: id,
      refundRatio: ratio,
      fullyRefunded: false,
    };
  };
  const returns = () =>
    store.invoices
      .filter((i) => i.type === "return_invoice")
      .map((i) => ({
        sourceId: String(i.sourceId),
        billingReference: i.billingReference,
        total: Number(i.total),
        net: Number(i.netAmount),
        tax: Number(i.taxAmount),
        lineItems: i.lineItems,
      }));

  return { service, store, refund, returns, provider, sendRecord, db };
}

describe("InvoiceReversalService: installment fee document", () => {
  it("reverses each refund by its own fee share: 26.55 then 39.83, summing to 66.38", async () => {
    const { service, refund, returns, sendRecord } = makeService();

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55, 0.4));
    await service.handleOrderRefund("o1", refund("ra2", "o1", 39.83, 0.6));

    expect(returns()).toEqual([
      {
        sourceId: "fee-1:ra1",
        billingReference: "TRD2026000000001",
        total: 26.55,
        net: 22.13,
        tax: 4.42,
        lineItems: [
          {
            name: "İade edilen taksit vade farkı",
            quantity: 1,
            net: 22.13,
            unitPrice: 22.13,
            vatRate: 20,
            taxAmount: 4.42,
          },
        ],
      },
      expect.objectContaining({
        sourceId: "fee-1:ra2",
        total: 39.83,
        // The closing return takes the exact remainder: 55.32 - 22.13.
        net: 33.19,
        tax: 6.64,
      }),
    ]);
    expect(sendRecord).toHaveBeenCalledTimes(2);
  });

  it("uses the fee share, not the goods ratio of the refund", async () => {
    const { service, refund, returns } = makeService();

    // Goods ratio 0.94 (940.00 of 1,000.00, 60.00 return shipping kept), but
    // the fee share given back is 62.40: the buyer keeps 3.98 of F.
    await service.handleOrderRefund("o1", refund("ra1", "o1", 62.4, 0.94));

    expect(returns()).toEqual([
      expect.objectContaining({ total: 62.4, net: 52.0, tax: 10.4 }),
    ]);
  });

  it("is idempotent: a replay of the same refund attempt cuts no second return", async () => {
    const { service, refund, returns } = makeService();
    const adjustment = refund("ra1", "o1", 26.55);

    await service.handleOrderRefund("o1", adjustment);
    await service.handleOrderRefund("o1", adjustment);

    expect(returns()).toHaveLength(1);
  });

  it("resends a return of the same attempt that failed to send instead of cutting another", async () => {
    const { service, refund, returns, store, sendRecord } = makeService();
    const adjustment = refund("ra1", "o1", 26.55);
    await service.handleOrderRefund("o1", adjustment);
    const ret = store.invoices.find((i) => i.type === "return_invoice");
    if (ret) ret.status = "failed";
    sendRecord.mockClear();

    await service.handleOrderRefund("o1", adjustment);

    expect(returns()).toHaveLength(1);
    expect(sendRecord).toHaveBeenCalledWith(ret?.id);
  });

  it("reverses each attempt's own share when the second refund's event is handled first", async () => {
    const { service, refund, returns } = makeService();
    const first = refund("ra1", "o1", 26.55);
    const second = refund("ra2", "o1", 39.83);

    await service.handleOrderRefund("o1", second);
    await service.handleOrderRefund("o1", first);

    expect(returns().map((r) => [r.sourceId, r.total])).toEqual([
      ["fee-1:ra2", 39.83],
      ["fee-1:ra1", 26.55],
    ]);
  });

  it("cuts no return when the document was cut after the refund (already net of it)", async () => {
    const { service, refund, returns } = makeService({
      invoices: [
        sentFeeInvoice({
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
          originalTotal: D("39.83"),
        }),
      ],
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55));

    expect(returns()).toEqual([]);
  });

  it("cuts no return for a refund that gave no fee back", async () => {
    const { service, refund, returns } = makeService();

    await service.handleOrderRefund("o1", refund("ra1", "o1", 0));

    expect(returns()).toEqual([]);
  });

  it("cancels a fresh e-Arşiv the refund fully reverses, without a return invoice", async () => {
    const { service, refund, returns, store, provider } = makeService({
      strategy: "CANCEL",
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1));

    expect(provider.cancelEArchive).toHaveBeenCalledTimes(1);
    expect(store.invoices[0]).toMatchObject({
      status: "cancelled",
      cancelReason: "refund",
    });
    expect(returns()).toEqual([]);
  });

  it("keeps a fresh e-Arşiv and cuts a return for a partial fee refund", async () => {
    const { service, refund, returns, provider } = makeService({
      strategy: "CANCEL",
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55));

    expect(provider.cancelEArchive).not.toHaveBeenCalled();
    expect(returns()).toHaveLength(1);
  });

  it("reprices an unsent document to the fee left, line included", async () => {
    const { service, refund, store, returns } = makeService({
      invoices: [sentFeeInvoice({ status: "pending", issuedAt: null })],
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55));

    expect(returns()).toEqual([]);
    expect(store.invoices[0]).toMatchObject({
      status: "pending",
      total: 39.83,
      netAmount: 33.19,
      taxAmount: 6.64,
      lineItems: [
        {
          name: "Taksit vade farkı",
          quantity: 1,
          net: 33.19,
          unitPrice: 33.19,
          vatRate: 20,
          taxAmount: 6.64,
        },
      ],
    });
  });

  it("cancels an unsent document locally once the whole fee went back", async () => {
    const { service, refund, store } = makeService({
      invoices: [sentFeeInvoice({ status: "failed", issuedAt: null })],
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1));

    expect(store.invoices[0]).toMatchObject({
      status: "cancelled",
      cancelReason: "refunded_before_issue",
    });
  });

  it("reverses another package's shortfall when the refund closing the payment carries it", async () => {
    // Cart of two packages: pkg1 (fee 39.83, 36.00 already reversed by its own
    // refunds) and pkg2 (fee 26.55). The refund closing the payment is on
    // pkg2 and gives back 26.55 + pkg1's 3.83 shortfall.
    const { service, refund, returns, store } = makeService({
      orderPackage: { o1: "pkg1", o2: "pkg2" },
      feeOf: { pkg1: 39.83, pkg2: 26.55 },
      refundedFee: { pkg1: 36.0 },
      paymentPackageIds: ["pkg1", "pkg2"],
      invoices: [
        sentFeeInvoice({
          id: "fee-1",
          sourceId: "pkg1",
          invoiceNumber: "TRD2026000000001",
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
        }),
        {
          id: "ret-0",
          type: "return_invoice",
          sourceId: "fee-1:ra0",
          status: "sent",
          billingReference: "TRD2026000000001",
          total: D("36.00"),
          netAmount: D("30.00"),
        },
        sentFeeInvoice({
          id: "fee-2",
          sourceId: "pkg2",
          invoiceNumber: "TRD2026000000002",
          netAmount: D("22.13"),
          taxAmount: D("4.42"),
          total: D("26.55"),
        }),
      ],
    });
    store.paymentFeeFullyRefunded = true;

    await service.handleOrderRefund("o2", refund("ra9", "o2", 30.38, 1));

    expect(
      returns()
        .filter((r) => r.sourceId.endsWith(":ra9"))
        .map((r) => [r.billingReference, r.total, r.net, r.tax]),
    ).toEqual([
      // Its own package first, then the payment's other packages.
      ["TRD2026000000002", 26.55, 22.13, 4.42],
      // pkg1's remainder: 39.83 - 36.00 = 3.83, net 33.19 - 30.00.
      ["TRD2026000000001", 3.83, 3.19, 0.64],
    ]);
  });

  it("lets the closing sweep take only another package's shortfall, never a share its own refund still has to reverse", async () => {
    // pkg1 (fee 60) was fully refunded by ra1, whose event has not run yet;
    // ra2 on pkg2 (fee 40) closes the payment and its event runs first.
    const { service, refund, returns, store } = makeService({
      orderPackage: { o1: "pkg1", o2: "pkg2" },
      feeOf: { pkg1: 60, pkg2: 40 },
      paymentPackageIds: ["pkg1", "pkg2"],
      invoices: [
        sentFeeInvoice({
          id: "fee-1",
          sourceId: "pkg1",
          invoiceNumber: "TRD2026000000001",
          netAmount: D("50.00"),
          taxAmount: D("10.00"),
          total: D("60.00"),
        }),
        sentFeeInvoice({
          id: "fee-2",
          sourceId: "pkg2",
          invoiceNumber: "TRD2026000000002",
          netAmount: D("33.33"),
          taxAmount: D("6.67"),
          total: D("40.00"),
        }),
      ],
    });
    const first = refund("ra1", "o1", 60, 1);
    const closing = refund("ra2", "o2", 40, 1);
    store.paymentFeeFullyRefunded = true;

    await service.handleOrderRefund("o2", closing);
    await service.handleOrderRefund("o1", first);

    expect(returns().map((r) => [r.sourceId, r.total])).toEqual([
      // Strategy RETURN_INVOICE: no cancel, one return per attempt and document.
      ["fee-2:ra2", 40],
      ["fee-1:ra1", 60],
    ]);
  });

  it("sweeps the other packages even when the closing order's own package carried no fee", async () => {
    // o3's package has no fee (no document), but its refund closed the
    // payment and gave back pkg1's 3.83 shortfall.
    const { service, refund, returns, store } = makeService({
      orderPackage: { o1: "pkg1", o3: "pkg3" },
      feeOf: { pkg1: 39.83 },
      refundedFee: { pkg1: 36.0 },
      paymentPackageIds: ["pkg1", "pkg3"],
      invoices: [
        sentFeeInvoice({
          id: "fee-1",
          sourceId: "pkg1",
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
        }),
        {
          id: "ret-0",
          type: "return_invoice",
          sourceId: "fee-1:ra0",
          status: "sent",
          billingReference: "TRD2026000000001",
          total: D("36.00"),
          netAmount: D("30.00"),
        },
      ],
    });
    store.paymentFeeFullyRefunded = true;

    await service.handleOrderRefund("o3", refund("ra9", "o3", 3.83, 1));

    expect(
      returns()
        .filter((r) => r.sourceId.endsWith(":ra9"))
        .map((r) => [r.sourceId, r.total]),
    ).toEqual([["fee-1:ra9", 3.83]]);
  });

  it("decides the amount inside the transaction: a return committed meanwhile is not reversed twice", async () => {
    const { service, refund, returns, store, db } = makeService();
    const adjustment = refund("ra2", "o1", 26.55);
    // Another handler (ra1, same share) commits its return between this
    // handler's first read and its transaction.
    const transaction = db.$transaction.getMockImplementation();
    db.$transaction.mockImplementationOnce(async (fn) => {
      store.invoices.push({
        id: "ret-x",
        type: "return_invoice",
        sourceId: "fee-1:ra1",
        status: "pending",
        billingReference: "TRD2026000000001",
        total: D("66.38"),
        netAmount: D("55.32"),
      });
      return transaction ? transaction(fn) : fn(db);
    });

    await service.handleOrderRefund("o1", adjustment);

    expect(returns().map((r) => r.sourceId)).toEqual(["fee-1:ra1"]);
  });

  it("reverses both refunds in full when another refund's return lands between the target read and the cut (66.38 -> 26.55)", async () => {
    const { service, refund, returns, store, db } = makeService();
    const first = refund("ra1", "o1", 26.55);
    const transaction = db.$transaction.getMockImplementation();
    // This handler has read its target (39.83). ra2 finalizes now and its
    // handler cuts its 13.28 return first; the old target would leave room
    // for 13.27 only and cap this attempt short for good.
    db.$transaction.mockImplementationOnce(async (fn) => {
      await service.handleOrderRefund("o1", refund("ra2", "o1", 13.28));
      return transaction ? transaction(fn) : fn(db);
    });

    await service.handleOrderRefund("o1", first);

    expect(returns().map((r) => [r.sourceId, r.total])).toEqual([
      ["fee-1:ra2", 13.28],
      ["fee-1:ra1", 26.55],
    ]);
    expect(store.refundedFee.pkg1).toBe(39.83);
  });

  it("cuts no return on the late, replayed or doubled event of a refund the document was cut net of", async () => {
    const { service, refund, returns, provider } = makeService({
      strategy: "CANCEL",
      invoices: [
        sentFeeInvoice({
          issuedAt: new Date(),
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
          originalTotal: D("39.83"),
        }),
      ],
    });
    const late = refund("ra1", "o1", 26.55);

    await service.handleOrderRefund("o1", late);
    await service.handleOrderRefund("o1", late);
    await Promise.all([
      service.handleOrderRefund("o1", late),
      service.handleOrderRefund("o1", late),
    ]);

    expect(returns()).toEqual([]);
    expect(provider.cancelEArchive).not.toHaveBeenCalled();
  });

  it("reverses a document repriced while unsent only for the refunds after it: 39.83 -> 26.55 -> 0", async () => {
    const { service, refund, returns, store, provider } = makeService({
      strategy: "CANCEL",
      invoices: [
        sentFeeInvoice({
          issuedAt: new Date(),
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
          originalTotal: D("39.83"),
        }),
      ],
    });
    // The unsent reprice of this refund stamped it; the stamp skips nothing.
    const stamped = refund("ra1", "o1", 26.55);
    store.invoices[0].refundAdjustedAt = store.attempts.ra1.finalizedAt;

    await service.handleOrderRefund("o1", stamped);
    expect(returns()).toEqual([]);

    const later = refund("ra2", "o1", 13.28);
    await service.handleOrderRefund("o1", later);
    await service.handleOrderRefund("o1", stamped);
    await service.handleOrderRefund("o1", later);
    expect(returns().map((r) => r.total)).toEqual([13.28]);

    await service.handleOrderRefund("o1", refund("ra3", "o1", 26.55));

    expect(returns().map((r) => r.total)).toEqual([13.28, 26.55]);
    expect(returns().reduce((sum, r) => sum + r.net, 0)).toBeCloseTo(33.19, 2);
    expect(returns().reduce((sum, r) => sum + r.tax, 0)).toBeCloseTo(6.64, 2);
    expect(provider.cancelEArchive).not.toHaveBeenCalled();
  });

  it("logs a refund whose whole share was capped away", async () => {
    const { service, refund } = makeService({
      invoices: [
        sentFeeInvoice({
          netAmount: D("33.19"),
          taxAmount: D("6.64"),
          total: D("39.83"),
          originalTotal: D("39.83"),
        }),
      ],
    });
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55));

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /^INSTALLMENT_FEE_RETURN_CAPPED invoice=TRD2026000000001 attempt=ra1 share=26.55 due=0$/,
      ),
    );
    warn.mockRestore();
  });

  it("does not cancel when another attempt's return lands before the cancel claim", async () => {
    const { service, refund, store, provider, db } = makeService({
      strategy: "CANCEL",
    });
    const adjustment = refund("ra2", "o1", 66.38, 1);
    const transaction = db.$transaction.getMockImplementation();
    // The first transaction is the cancel claim: a return commits just before.
    db.$transaction.mockImplementationOnce(async (fn) => {
      store.invoices.push({
        id: "ret-x",
        type: "return_invoice",
        sourceId: "fee-1:ra1",
        status: "pending",
        billingReference: "TRD2026000000001",
        total: D("26.55"),
        netAmount: D("22.13"),
      });
      return transaction ? transaction(fn) : fn(db);
    });

    await service.handleOrderRefund("o1", adjustment);

    expect(provider.cancelEArchive).not.toHaveBeenCalled();
    // The return path decides from what is left: 66.38 - 26.55.
    expect(
      store.invoices
        .filter((i) => i.sourceId === "fee-1:ra2")
        .map((i) => Number(i.total)),
    ).toEqual([39.83]);
  });

  it("cuts no return while another handler holds the cancel claim", async () => {
    const { service, refund, returns } = makeService({
      strategy: "CANCEL",
      invoices: [
        sentFeeInvoice({
          cancelReason: formatInvoiceCancelClaim("other-run", new Date()),
        }),
      ],
    });

    // Backs off (the outbox retries) instead of cutting a return that could
    // land on top of the other run's cancel.
    await expect(
      service.handleOrderRefund("o1", refund("ra1", "o1", 26.55)),
    ).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
    expect(returns()).toEqual([]);
  });

  /**
   * QA F1: the fast path and the outbox drainer handle the SAME attempt at
   * once. The claim is exclusive per run: the second run backs off, so a
   * refused second cancel can never turn into a return on top of the first
   * run's cancel.
   */
  it("lets only one of two runs of the same attempt cancel; the other backs off", async () => {
    const { service, refund, store, provider, returns } = makeService({
      strategy: "CANCEL",
    });
    const adjustment = refund("ra1", "o1", 66.38, 1);
    let release: () => void = () => undefined;
    provider.cancelEArchive
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ success: true, resultMsg: "OK" });
          }),
      )
      .mockImplementation(async () => ({
        success: false,
        resultMsg: "already being cancelled",
      }));

    const first = service.handleOrderRefund("o1", adjustment);
    // Let the first run take the claim and wait on eLogo.
    await new Promise((r) => setImmediate(r));
    await expect(service.handleOrderRefund("o1", adjustment)).rejects.toThrow(
      /INVOICE_CANCEL_IN_PROGRESS/,
    );
    release();
    await first;

    expect(provider.cancelEArchive).toHaveBeenCalledTimes(1);
    expect(store.invoices[0]).toMatchObject({
      status: "cancelled",
      cancelReason: "refund",
    });
    expect(returns()).toEqual([]);
    // The retry of the backed-off run finds the document cancelled.
    await service.handleOrderRefund("o1", adjustment);
    expect(returns()).toEqual([]);
  });

  it("falls back to a return only in the run holding the claim, after releasing it", async () => {
    const { service, refund, store, provider, returns } = makeService({
      strategy: "CANCEL",
    });
    provider.cancelEArchive.mockResolvedValueOnce({
      success: false,
      resultMsg: "refused",
    });
    provider.getStatus.mockResolvedValueOnce({ state: "completed" } as never);

    await service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1));

    expect(store.invoices[0]).toMatchObject({
      status: "sent",
      cancelReason: "refund",
    });
    expect(returns().map((r) => r.total)).toEqual([66.38]);
  });

  /**
   * QA F2: a cancel whose outcome stayed unknown leaves the claim. A later
   * run settles it from the provider's status instead of finding the claim
   * and cutting nothing forever.
   */
  describe("a claim left by an unknown cancel outcome", () => {
    afterEach(() => jest.useRealTimers());

    async function stuck() {
      const made = makeService({ strategy: "CANCEL" });
      made.provider.cancelEArchive.mockImplementationOnce(async () => {
        throw new Error("socket hang up");
      });
      const adjustment = made.refund("ra1", "o1", 66.38, 1);
      await expect(
        made.service.handleOrderRefund("o1", adjustment),
      ).rejects.toThrow(/INVOICE_CANCEL_OUTCOME_UNKNOWN/);
      expect(String(made.store.invoices[0].cancelReason)).toMatch(
        /^refund_cancelling:\d+:/,
      );
      // The outbox retries after the lease and the 8-day window.
      jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
      jest.setSystemTime(Date.now() + INVOICE_CANCEL_LEASE_MS + 1);
      made.provider.eArchiveReversalStrategy.mockReturnValue("RETURN_INVOICE");
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      return { ...made, adjustment, error };
    }

    it("still reverses the document when eLogo says it stands", async () => {
      const { service, store, provider, adjustment, returns, error } =
        await stuck();
      provider.getStatus.mockResolvedValueOnce({ state: "completed" } as never);

      await service.handleOrderRefund("o1", adjustment);

      expect(returns().map((r) => r.total)).toEqual([66.38]);
      expect(store.invoices[0]).toMatchObject({
        status: "sent",
        cancelReason: null,
      });
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/^INVOICE_CANCEL_CLAIM_STUCK invoice=/),
      );
      error.mockRestore();
    });

    it("marks it cancelled when eLogo says the cancel went through", async () => {
      const { service, store, provider, adjustment, returns, error } =
        await stuck();
      provider.getStatus.mockResolvedValueOnce({ state: "cancelled" } as never);

      await service.handleOrderRefund("o1", adjustment);

      expect(returns()).toEqual([]);
      expect(store.invoices[0]).toMatchObject({
        status: "cancelled",
        cancelReason: "refund",
      });
      error.mockRestore();
    });

    it("keeps retrying while eLogo cannot tell", async () => {
      const { service, store, adjustment, returns, error } = await stuck();

      await expect(service.handleOrderRefund("o1", adjustment)).rejects.toThrow(
        /INVOICE_CANCEL_OUTCOME_UNKNOWN/,
      );
      expect(returns()).toEqual([]);
      expect(String(store.invoices[0].cancelReason)).toMatch(
        /^refund_cancelling:/,
      );
      error.mockRestore();
    });

    it.each(["processing", "unknown", "failed"])(
      "keeps the claim and retries while eLogo answers %s",
      async (state) => {
        const { service, store, provider, adjustment, returns, error } =
          await stuck();
        provider.getStatus.mockResolvedValueOnce({ state } as never);

        await expect(
          service.handleOrderRefund("o1", adjustment),
        ).rejects.toThrow(/INVOICE_CANCEL_OUTCOME_UNKNOWN/);
        expect(returns()).toEqual([]);
        expect(provider.cancelEArchive).toHaveBeenCalledTimes(1);
        expect(String(store.invoices[0].cancelReason)).toMatch(
          /^refund_cancelling:/,
        );
        error.mockRestore();
      },
    );

    it("cancels again under a new claim when eLogo says it stands and the window is still open", async () => {
      const { service, store, provider, adjustment, returns, error } =
        await stuck();
      provider.eArchiveReversalStrategy.mockReturnValue("CANCEL");
      provider.getStatus.mockResolvedValueOnce({ state: "completed" } as never);

      await service.handleOrderRefund("o1", adjustment);

      expect(provider.cancelEArchive).toHaveBeenCalledTimes(2);
      expect(store.invoices[0]).toMatchObject({
        status: "cancelled",
        cancelReason: "refund",
      });
      expect(returns()).toEqual([]);
      error.mockRestore();
    });

    it("cuts nothing when another run settled the stale claim first", async () => {
      const { service, store, provider, adjustment, returns, error } =
        await stuck();
      // While this run asks eLogo, another run settles the claim and takes
      // a new one.
      provider.getStatus.mockImplementationOnce(async () => {
        store.invoices[0].cancelReason = formatInvoiceCancelClaim(
          "other-run",
          new Date(),
        );
        return { state: "completed" } as never;
      });

      await expect(service.handleOrderRefund("o1", adjustment)).rejects.toThrow(
        /INVOICE_CANCEL_CLAIM_LOST/,
      );
      expect(returns()).toEqual([]);
      error.mockRestore();
    });
  });

  it("backs off without asking eLogo while a crashed holder's claim is inside its lease", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    try {
      const claimedAt = new Date();
      const { service, refund, provider, returns } = makeService({
        strategy: "RETURN_INVOICE",
        invoices: [
          sentFeeInvoice({
            cancelReason: formatInvoiceCancelClaim("dead", claimedAt),
          }),
        ],
      });
      jest.setSystemTime(claimedAt.getTime() + INVOICE_CANCEL_LEASE_MS - 1);

      await expect(
        service.handleOrderRefund("o1", refund("ra1", "o1", 26.55)),
      ).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
      expect(provider.getStatus).not.toHaveBeenCalled();
      expect(returns()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("backs off when a cancel claim lands between its read and its return transaction", async () => {
    const { service, refund, store, returns, db } = makeService();
    const transaction = db.$transaction.getMockImplementation();
    db.$transaction.mockImplementationOnce(async (fn) => {
      store.invoices[0].cancelReason = formatInvoiceCancelClaim(
        "closing-run",
        new Date(),
      );
      return transaction ? transaction(fn) : fn(db);
    });

    await expect(
      service.handleOrderRefund("o1", refund("ra1", "o1", 26.55)),
    ).rejects.toThrow(/INVOICE_CANCEL_IN_PROGRESS/);
    expect(returns()).toEqual([]);
  });

  it("does not fall back to a return when its claim was taken over during a refused cancel", async () => {
    const { service, refund, store, provider, returns } = makeService({
      strategy: "CANCEL",
    });
    provider.cancelEArchive.mockImplementationOnce(async () => {
      store.invoices[0].cancelReason = formatInvoiceCancelClaim(
        "other-run",
        new Date(),
      );
      return { success: false, resultMsg: "refused" };
    });
    provider.getStatus.mockResolvedValueOnce({ state: "completed" } as never);

    await expect(
      service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1)),
    ).rejects.toThrow(/INVOICE_CANCEL_CLAIM_LOST/);
    expect(returns()).toEqual([]);
  });

  describe("a cancel call that fails in transport", () => {
    const fails = async () => {
      throw new Error("socket hang up");
    };

    it("falls back to a return only when eLogo shows the document standing", async () => {
      const { service, refund, store, returns, provider } = makeService({
        strategy: "CANCEL",
      });
      provider.cancelEArchive.mockImplementationOnce(fails);
      provider.getStatus.mockResolvedValueOnce({ state: "completed" } as never);

      await service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1));

      expect(store.invoices[0]).toMatchObject({
        status: "sent",
        cancelReason: "refund",
      });
      expect(returns().map((r) => [r.total, r.net, r.tax])).toEqual([
        [66.38, 55.32, 11.06],
      ]);
    });

    it.each(["processing", "unknown", "failed"])(
      "keeps the claim and cuts no return while eLogo answers %s",
      async (state) => {
        const { service, refund, store, returns, provider } = makeService({
          strategy: "CANCEL",
        });
        provider.cancelEArchive.mockImplementationOnce(fails);
        provider.getStatus.mockResolvedValueOnce({ state } as never);

        await expect(
          service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1)),
        ).rejects.toThrow(/INVOICE_CANCEL_OUTCOME_UNKNOWN/);

        expect(returns()).toEqual([]);
        expect(store.invoices[0].status).toBe("sent");
        expect(String(store.invoices[0].cancelReason)).toMatch(
          /^refund_cancelling:\d+:/,
        );
      },
    );
  });

  it.each([
    ["the cancel call", { success: true, resultMsg: "OK" }, null],
    [
      "the status after a refused call",
      { success: false, resultMsg: "refused" },
      { state: "cancelled", resultMsg: "cancelled" },
    ],
  ])(
    "marks the document cancelled and raises the alarm when %s confirms it after the claim was lost",
    async (_name, answer, status) => {
      const { service, refund, store, returns, provider } = makeService({
        strategy: "CANCEL",
      });
      provider.cancelEArchive.mockImplementationOnce(async () => {
        store.invoices[0].cancelReason = formatInvoiceCancelClaim(
          "other-run",
          new Date(),
        );
        return answer as never;
      });
      if (status) provider.getStatus.mockResolvedValueOnce(status as never);
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      await service.handleOrderRefund("o1", refund("ra1", "o1", 66.38, 1));

      expect(store.invoices[0]).toMatchObject({
        status: "cancelled",
        cancelReason: "refund",
      });
      expect(returns()).toEqual([]);
      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/^INVOICE_CANCEL_CLAIM_LOST invoice=/),
      );
      error.mockRestore();
    },
  );

  it("cuts no return when another handler cancelled the document after it was read", async () => {
    const { service, refund, store, returns, db } = makeService();
    const transaction = db.$transaction.getMockImplementation();
    // Another attempt's handler cancels the e-Arşiv between this handler's
    // read and its return transaction.
    db.$transaction.mockImplementationOnce(async (fn) => {
      Object.assign(store.invoices[0], {
        status: "cancelled",
        cancelReason: "refund",
      });
      return transaction ? transaction(fn) : fn(db);
    });

    await service.handleOrderRefund("o1", refund("ra1", "o1", 26.55));

    expect(returns()).toEqual([]);
  });

  describe("a refund event without an attempt (queued before attempts were carried)", () => {
    const priorReturn = {
      id: "ret-0",
      type: "return_invoice",
      sourceId: "fee-1:ra1",
      status: "sent",
      billingReference: "TRD2026000000001",
      total: D("26.55"),
      netAmount: D("22.13"),
    };

    it("cancels a fresh e-Arşiv", async () => {
      const { service, store, returns, provider } = makeService({
        strategy: "CANCEL",
      });

      await service.handleOrderRefund("o1");

      expect(provider.cancelEArchive).toHaveBeenCalledTimes(1);
      expect(store.invoices[0].status).toBe("cancelled");
      expect(returns()).toEqual([]);
    });

    it("returns the whole document once the cancel window closed", async () => {
      const { service, returns } = makeService();

      await service.handleOrderRefund("o1");

      expect(returns()).toMatchObject([
        { sourceId: "fee-1", total: 66.38, net: 55.32, tax: 11.06 },
      ]);
    });

    it("returns only what earlier returns left, never cancelling", async () => {
      const { service, store, provider } = makeService({
        strategy: "CANCEL",
        invoices: [sentFeeInvoice(), priorReturn],
      });

      await service.handleOrderRefund("o1");

      expect(provider.cancelEArchive).not.toHaveBeenCalled();
      expect(
        store.invoices
          .filter((i) => i.sourceId === "fee-1")
          .map((i) => [Number(i.total), Number(i.netAmount)]),
      ).toEqual([[39.83, 33.19]]);
    });
  });
});
