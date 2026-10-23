import { OrderStatus, PayoutStatus, RefundAttemptStatus } from "@prisma/client";
import { PayoutService } from "../payout.service";

/**
 * In-memory Prisma double for the payout processor (`processPendingPayouts`,
 * `processRetryPayouts`, `handleTransferResultCallback`). Specs describe the
 * money state (payments, holds, refunds, transfers on an oid) and read back
 * what the processor wrote; the CAS writes honour `status` and
 * `failureReason` the way Postgres would, so idempotency is observable.
 */

export const FIXTURE_IBAN = "TR330006100519786457841326";

type Deps = ConstructorParameters<typeof PayoutService>;

/** The Prisma arguments the double reads, as loose as the processor sends them. */
interface Where {
  id?: string | { not?: string };
  transId?: string;
  merchantOid?: string;
  status?: string | { in?: readonly string[] };
  failureReason?: string | null;
  nextRetryAt?: { lte?: Date };
  paymentId?: string;
  orderId?: string | null;
  tradeId?: string | null;
}
interface Call {
  where: Where;
  data?: Record<string, unknown>;
}

const idOf = (id: Where["id"]): string | undefined =>
  typeof id === "string" ? id : undefined;
const notIdOf = (id: Where["id"]): string | undefined =>
  typeof id === "object" ? id.not : undefined;
const statusMatches = (status: string, filter: Where["status"]): boolean =>
  filter === undefined ||
  (typeof filter === "string"
    ? status === filter
    : (filter.in ?? []).includes(status));
const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

export interface FixturePayout {
  id: string;
  sellerId: string;
  merchantOid: string;
  transId: string;
  amount: number;
  netAmount: number;
  status: PayoutStatus;
  failureReason: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  providerResponse: unknown;
  providerReference: string | null;
  submittedAt: Date | null;
  submittedAmount: number | null;
  submittedTotalAmount: number | null;
  processedAt: Date | null;
  transferIban: string;
  transferName: string;
  paymentHoldId: string | null;
  tradeCashPaymentId: string | null;
}

interface FixturePayment {
  id: string;
  amount: number;
  metadata: Record<string, unknown> | null;
  paidAt: Date;
  createdAt: Date;
}

interface FixtureHold {
  id: string;
  paymentId: string;
  orderId: string;
  amount: number;
  refundedAmount: number;
}

interface FixtureTradeCash {
  id: string;
  tradeId: string;
  totalAmount: number;
  paymentId: string;
  paidAt: Date;
}

interface FixtureRefundAttempt {
  paymentId: string;
  orderId: string | null;
  tradeId: string | null;
  amount: number;
  status: RefundAttemptStatus;
}

export class PayoutProcessorWorld {
  payouts: FixturePayout[] = [];
  payments = new Map<string, FixturePayment>();
  holds = new Map<string, FixtureHold>();
  orders = new Map<
    string,
    { id: string; status: OrderStatus; totalAmount: number }
  >();
  tradeCash = new Map<string, FixtureTradeCash>();
  refundAttempts: FixtureRefundAttempt[] = [];
  bankAccount: Record<string, unknown> | null = {
    userId: "seller-1",
    iban: FIXTURE_IBAN,
    accountHolder: "Seller Name",
    ibanChangedAt: null,
    isVerified: true,
  };

  addPayment(
    id: string,
    amount: number,
    metadata: Record<string, unknown> | null = null,
  ) {
    this.payments.set(id, {
      id,
      amount,
      metadata,
      paidAt: THREE_DAYS_AGO,
      createdAt: THREE_DAYS_AGO,
    });
  }

  /** An order payout: order + released hold + transfer row. */
  addOrderPayout(input: {
    payoutId: string;
    paymentId: string;
    orderId: string;
    orderTotal: number;
    holdAmount: number;
    holdRefunded?: number;
    merchantOid: string;
    transId: string;
    status?: PayoutStatus;
    over?: Partial<FixturePayout>;
  }): FixturePayout {
    const holdId = `hold-${input.orderId}`;
    this.orders.set(input.orderId, {
      id: input.orderId,
      status: OrderStatus.completed,
      totalAmount: input.orderTotal,
    });
    this.holds.set(holdId, {
      id: holdId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      amount: input.holdAmount,
      refundedAmount: input.holdRefunded ?? 0,
    });
    return this.addPayout({
      id: input.payoutId,
      merchantOid: input.merchantOid,
      transId: input.transId,
      amount: input.orderTotal,
      netAmount: input.holdAmount - (input.holdRefunded ?? 0),
      status: input.status ?? PayoutStatus.pending,
      paymentHoldId: holdId,
      ...input.over,
    });
  }

  addTradeCashPayout(input: {
    payoutId: string;
    paymentId: string;
    tradeId: string;
    totalAmount: number;
    net: number;
    merchantOid: string;
    transId: string;
  }): FixturePayout {
    const tcpId = `tcp-${input.tradeId}`;
    this.tradeCash.set(tcpId, {
      id: tcpId,
      tradeId: input.tradeId,
      totalAmount: input.totalAmount,
      paymentId: input.paymentId,
      paidAt: THREE_DAYS_AGO,
    });
    return this.addPayout({
      id: input.payoutId,
      merchantOid: input.merchantOid,
      transId: input.transId,
      amount: input.totalAmount,
      netAmount: input.net,
      tradeCashPaymentId: tcpId,
    });
  }

  addPayout(over: Partial<FixturePayout> & { id: string }): FixturePayout {
    const row: FixturePayout = {
      sellerId: "seller-1",
      merchantOid: "OID1",
      transId: `PYT${over.id.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`,
      amount: 100,
      netAmount: 90,
      status: PayoutStatus.pending,
      failureReason: null,
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: null,
      providerResponse: null,
      providerReference: null,
      submittedAt: null,
      submittedAmount: null,
      submittedTotalAmount: null,
      processedAt: null,
      transferIban: FIXTURE_IBAN,
      transferName: "Seller Name",
      paymentHoldId: null,
      tradeCashPaymentId: null,
      ...over,
    };
    this.payouts.push(row);
    return row;
  }

  payout(id: string): FixturePayout {
    const row = this.payouts.find((p) => p.id === id);
    if (!row) throw new Error(`no payout ${id}`);
    return row;
  }

  private withRelations(row: FixturePayout) {
    const hold = row.paymentHoldId ? this.holds.get(row.paymentHoldId) : null;
    const holdPayment = hold ? this.payments.get(hold.paymentId) : null;
    const tcp = row.tradeCashPaymentId
      ? this.tradeCash.get(row.tradeCashPaymentId)
      : null;
    const tcpPayment = tcp ? this.payments.get(tcp.paymentId) : null;
    return {
      ...row,
      paymentHold: hold
        ? { ...hold, payment: holdPayment ? { ...holdPayment } : null }
        : null,
      tradeCashPayment: tcp
        ? { ...tcp, payment: tcpPayment ? { ...tcpPayment } : null }
        : null,
    };
  }

  private matchesCas(row: FixturePayout, where: Where): boolean {
    if (idOf(where.id) !== undefined && row.id !== idOf(where.id)) return false;
    if (!statusMatches(row.status, where.status)) return false;
    if (
      where.failureReason !== undefined &&
      row.failureReason !== where.failureReason
    ) {
      return false;
    }
    return true;
  }

  private apply(row: FixturePayout, data: Record<string, unknown>) {
    for (const [key, value] of Object.entries(data)) {
      (row as unknown as Record<string, unknown>)[key] =
        value !== null &&
        typeof value === "object" &&
        "toNumber" in (value as object)
          ? (value as { toNumber(): number }).toNumber()
          : value;
    }
  }

  prisma() {
    return {
      payoutTransfer: {
        findMany: jest.fn(async ({ where }: Call) => {
          if (where.merchantOid !== undefined) {
            return this.payouts
              .filter(
                (p) =>
                  p.merchantOid === where.merchantOid &&
                  p.id !== notIdOf(where.id),
              )
              .map((p) => ({ ...p }));
          }
          if (where.status === PayoutStatus.pending) {
            return this.payouts
              .filter((p) => p.status === PayoutStatus.pending)
              .map((p) => this.withRelations(p));
          }
          if (where.status === PayoutStatus.retry_pending) {
            const due = where.nextRetryAt?.lte ?? new Date();
            return this.payouts
              .filter(
                (p) =>
                  p.status === PayoutStatus.retry_pending &&
                  (!p.nextRetryAt || p.nextRetryAt <= due),
              )
              .map((p) => ({ ...p }));
          }
          return [];
        }),
        findUnique: jest.fn(async ({ where }: Call) => {
          const row = this.payouts.find(
            (p) =>
              (where.id !== undefined && p.id === idOf(where.id)) ||
              (where.transId !== undefined && p.transId === where.transId),
          );
          return row ? this.withRelations(row) : null;
        }),
        updateMany: jest.fn(async ({ where, data }: Call) => {
          const rows = this.payouts.filter((p) => this.matchesCas(p, where));
          rows.forEach((row) => this.apply(row, data ?? {}));
          return { count: rows.length };
        }),
        update: jest.fn(async ({ where, data }: Call) => {
          const row = this.payout(idOf(where.id) ?? "");
          this.apply(row, data ?? {});
          return { ...row };
        }),
        count: jest.fn(async () => 0),
      },
      order: {
        findUnique: jest.fn(
          async ({ where }: Call) =>
            this.orders.get(idOf(where.id) ?? "") ?? null,
        ),
      },
      refundRequest: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
      },
      refundAttempt: {
        findFirst: jest.fn(
          async ({ where }: Call) =>
            this.refundAttempts.find(
              (a) =>
                a.paymentId === where.paymentId &&
                a.orderId === (where.orderId ?? null) &&
                a.tradeId === (where.tradeId ?? null) &&
                where.status !== undefined &&
                statusMatches(a.status, where.status),
            ) ?? null,
        ),
        findMany: jest.fn(async ({ where }: Call) =>
          this.refundAttempts.filter((a) => a.paymentId === where.paymentId),
        ),
      },
      sellerBankAccount: {
        findUnique: jest.fn(async () => this.bankAccount),
      },
      user: {
        findUnique: jest.fn(async () => ({ displayName: "Seller" })),
      },
    };
  }
}

/** `createPlatformTransfer` double; calls are read as `mock.calls[i][0]`. */
export type TransferMock = jest.Mock;

/** PayoutService wired to the world, a PayTR transfer double and spies. */
export function buildPayoutProcessor(
  world: PayoutProcessorWorld,
  opts: { createPlatformTransfer?: TransferMock; callbackFlag?: boolean } = {},
) {
  const prisma = world.prisma();
  const createPlatformTransfer: TransferMock =
    opts.createPlatformTransfer ??
    jest.fn(async () => ({ status: "success", reference: "REF1" }));
  const verifyTransferCallback = jest.fn(() => true);
  const notification = { sendTemplateEmailToUser: jest.fn() };
  const ledger = { record: jest.fn() };
  const service = new PayoutService(
    prisma as unknown as Deps[0],
    {
      resolve: () => ({ createPlatformTransfer, verifyTransferCallback }),
    } as unknown as Deps[1],
    {
      get: (key: string) =>
        key === "PAYTR_TRANSFER_CALLBACK_ENABLED" && opts.callbackFlag
          ? "true"
          : undefined,
    } as unknown as Deps[2],
    notification as unknown as Deps[3],
    ledger as unknown as Deps[4],
  );
  return { service, prisma, createPlatformTransfer, notification, ledger };
}
