import { OrderStatus, PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * F1 — Satıcı kesintileri (adjustment) deftere yazılır.
 *
 * Capture'da hold.amount kadar seller_escrow BORÇLANIR; payout ledger'ı yalnız
 * transfer edilen net'i kapatır. Kesinti (kargo açığı / iade kargosu borcu)
 * deftere yazılmayınca escrow'da kesinti kadar kalıntı SONSUZA DEK açık
 * kalıyordu; fullyConsumed payout'ta (borç net'i yutar) escrow tamamen açık
 * kalıyordu. Artık payout üretiminde `adjustment` olayı yazılır:
 *   debit seller_debt_recovery / credit seller_escrow (kesinti tutarı).
 * Best-effort: ledger hatası payout üretimini BOZMAZ (mevcut kalıp).
 */

function makeHarness(opts: { debt: number; ledgerThrows?: boolean }) {
  let created: any;
  const hold = {
    id: "hold-1",
    orderId: "order-1",
    amount: 100,
    refundedAmount: 0,
    sellerId: "seller-1",
    paymentId: "payment-1",
    payment: { providerConversationId: "OID-1" },
    seller: { bankAccount: { iban: "TR0001", accountHolder: "Seller" } },
  };
  const order = {
    id: "order-1",
    orderNumber: "B-1001",
    status: OrderStatus.completed,
    totalAmount: 120,
    commissionAmount: 20,
    withholdingTaxAmount: 0,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    payoutTransfer: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: any) => {
        created = { id: "payout-1", ...data };
        return Promise.resolve(created);
      }),
    },
    sellerAccountAdjustment: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.debt > 0
            ? [{ id: "adjustment-1", remainingAmount: opts.debt }]
            : [],
        ),
      update: jest.fn().mockResolvedValue({}),
    },
    sellerAdjustmentApplication: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
    order: { findMany: jest.fn().mockResolvedValue([order]) },
    refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
    tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
    sellerAccountAdjustment: {
      findFirst: jest.fn().mockResolvedValue({ id: "adjustment-1" }),
    },
    payoutTransfer: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const ledger = {
    record: opts.ledgerThrows
      ? jest.fn().mockRejectedValue(new Error("ledger down"))
      : jest.fn().mockResolvedValue("group-1"),
  };
  const service = new PayoutService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    ledger as any,
  );
  return { service, tx, ledger, getCreated: () => created };
}

describe("PayoutService adjustment ledger (F1)", () => {
  it("books the deduction as debit seller_debt_recovery / credit seller_escrow", async () => {
    const { service, tx, ledger } = makeHarness({ debt: 30 });

    expect(await service.createPayoutsForReleasedHolds()).toBe(1);

    expect(ledger.record).toHaveBeenCalledTimes(1);
    const [txArg, input] = ledger.record.mock.calls[0];
    expect(txArg).toBe(tx); // payout ile AYNI transaction'da
    expect(input.eventType).toBe("adjustment");
    expect(input.entries).toEqual([
      { account: "seller_debt_recovery", direction: "debit", amount: 30 },
      {
        account: "seller_escrow",
        direction: "credit",
        amount: 30,
        sellerId: "seller-1",
      },
    ]);
    expect(input.refs).toMatchObject({
      payoutId: "payout-1",
      sellerId: "seller-1",
      orderId: "order-1",
      holdId: "hold-1",
    });
    // İdempotency: payout başına TEK kesinti kaydı (hold ↔ payout 1:1).
    expect(input.idempotencyKey).toBe("adjustment:payout:payout-1");
  });

  it("records the FULL deduction when the debt consumes the whole payout (escrow açık kalmasın)", async () => {
    const { service, ledger, getCreated } = makeHarness({ debt: 180 });

    await service.createPayoutsForReleasedHolds();

    // Payout net 0 + anında completed — transfer olmayacağı için payout ledger'ı
    // hiç koşmaz; escrow'u KAPATAN tek kayıt bu adjustment olayıdır.
    expect(getCreated()).toMatchObject({
      netAmount: 0,
      status: PayoutStatus.completed,
    });
    const [, input] = ledger.record.mock.calls[0];
    expect(input.entries[0]).toMatchObject({ amount: 100 });
  });

  it("does not write a ledger event when there is no deduction", async () => {
    const { service, ledger } = makeHarness({ debt: 0 });

    await service.createPayoutsForReleasedHolds();

    expect(ledger.record).not.toHaveBeenCalled();
  });

  /**
   * FAIL-LOUD (eskiden best-effort): bu yazım payout TX'İNİN İÇİNDE ve escrow'u
   * kapatan TEK kayıt. Hata yutulunca payout oluşuyor, kesinti deftere hiç
   * yazılmıyor ve escrow'da kesinti kadar kalıntı SONSUZA DEK açık kalıyordu —
   * üstelik hiçbir invaryant bunu yakalamıyordu. Aynı tx'te olduğu için fırlatmak
   * payout'u geri alır: bir sonraki tur temiz defterle yeniden dener.
   */
  it("rolls back the payout when the ledger write fails (escrow kalıntısı bırakma)", async () => {
    const { service } = makeHarness({ debt: 30, ledgerThrows: true });

    await expect(service.createPayoutsForReleasedHolds()).rejects.toThrow(
      "ledger down",
    );
  });
});
