import { Prisma } from "@prisma/client";
import { InvoiceReversalService } from "./invoice-reversal.service";
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
          orders: [
            {
              id: `${packageId}-o`,
              fee,
              refundedFee: store.refundedFee[packageId] ?? 0,
            },
          ],
          paymentFeeFullyRefunded: store.paymentFeeFullyRefunded,
          vatRatePct: 20,
          paymentPackageIds: store.paymentFeeFullyRefunded
            ? store.paymentPackageIds
            : [],
        };
      },
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

  return { service, store, refund, returns, provider, sendRecord };
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
});
