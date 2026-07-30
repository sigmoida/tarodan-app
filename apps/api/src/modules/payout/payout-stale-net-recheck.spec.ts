import { PayoutService } from "./payout.service";
import { OrderStatus, PayoutStatus } from "@prisma/client";

/**
 * BLOCKER: kısmi iade `pending` payout'u void eder ama satırdaki `netAmount`'u
 * GÜNCELLEMEZ. `paymentHoldId` unique olduğu için düzeltilmiş yeni payout da
 * asla oluşamaz, dolayısıyla admin'in `retryPayoutTransfer` ile satırı yeniden
 * `pending`'e çekmesi tek yoldur — ve o an transfer, iade ÖNCESİ bayat tutarı
 * gönderir (satıcıya fazla ödeme + platform çifte kayıp).
 *
 * Bu testler, transferin hak edilen güncel net tutarı (hold.amount −
 * refundedAmount) kaynağından yeniden okumasını kilitler.
 */
describe("PayoutService — stale netAmount recheck before transfer", () => {
  const makeService = (payout: any, order: any) => {
    const transfers: any[] = [];
    const updates: any[] = [];
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([payout]),
        updateMany: jest.fn().mockImplementation((arg: any) => {
          updates.push(arg);
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation((arg: any) => {
          updates.push(arg);
          return Promise.resolve({});
        }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue({}),
      },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      sellerBankAccount: {
        findUnique: jest.fn().mockResolvedValue({
          userId: "s1",
          // Geçerli mod-97 TR IBAN (checksum doğrulamasını geçmeli).
          iban: "TR330006100519786457841326",
          accountHolder: "Satici",
          ibanChangedAt: null,
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: "S" }) },
    };
    const createPlatformTransfer = jest.fn().mockImplementation((arg: any) => {
      transfers.push(arg);
      return Promise.resolve({ status: "success" });
    });
    const service = new PayoutService(
      prisma as any,
      { resolve: () => ({ createPlatformTransfer }) } as any,
      { get: () => undefined } as any,
      {
        sendTemplateEmailToUser: jest.fn().mockResolvedValue(undefined),
      } as any,
    );
    return { service, transfers, updates, prisma, createPlatformTransfer };
  };

  const order = {
    id: "o1",
    status: OrderStatus.completed,
    orderNumber: "ORD-1",
  };

  it("kısmi iade sonrası retry: bayat netAmount değil, güncel hak edilen tutar transfer edilir", async () => {
    // Payout iade ÖNCESİ oluştu: net 85. Sonra 30 TL kısmi iade → hak edilen 55.
    const payout = {
      id: "p1",
      sellerId: "s1",
      status: PayoutStatus.pending,
      netAmount: 85,
      amount: 100,
      commission: 12,
      merchantOid: "OID1",
      transId: "T1",
      transferIban: "TR330006100519786457841326",
      transferName: "Satici",
      paymentHold: {
        paymentId: "pay1",
        orderId: "o1",
        amount: 85,
        refundedAmount: 30,
      },
      tradeCashPayment: null,
    };
    const { service, transfers } = makeService(payout, order);

    await service.processPendingPayouts();

    expect(transfers).toHaveLength(1);
    // KRİTİK: 85 değil 55 gönderilmeli.
    expect(transfers[0].submerchantAmount).toBe(55);
  });

  it("tamamı iade edilmişse transfer HİÇ yapılmaz ve payout failed işaretlenir", async () => {
    const payout = {
      id: "p2",
      sellerId: "s1",
      status: PayoutStatus.pending,
      netAmount: 85,
      amount: 100,
      commission: 12,
      merchantOid: "OID2",
      transId: "T2",
      transferIban: "TR330006100519786457841326",
      transferName: "Satici",
      paymentHold: {
        paymentId: "pay1",
        orderId: "o1",
        amount: 85,
        refundedAmount: 85,
      },
      tradeCashPayment: null,
    };
    const { service, transfers, updates } = makeService(payout, order);

    await service.processPendingPayouts();

    expect(transfers).toHaveLength(0);
    const failure = updates.find(
      (u: any) => u.data?.failureReason === "fully_refunded",
    );
    expect(failure).toBeDefined();
  });

  it("iade yoksa saklanan net tutar aynen transfer edilir (regresyon koruması)", async () => {
    const payout = {
      id: "p3",
      sellerId: "s1",
      status: PayoutStatus.pending,
      netAmount: 88,
      amount: 100,
      commission: 12,
      merchantOid: "OID3",
      transId: "T3",
      transferIban: "TR330006100519786457841326",
      transferName: "Satici",
      paymentHold: {
        paymentId: "pay1",
        orderId: "o1",
        amount: 88,
        refundedAmount: 0,
      },
      tradeCashPayment: null,
    };
    const { service, transfers } = makeService(payout, order);

    await service.processPendingPayouts();

    expect(transfers).toHaveLength(1);
    expect(transfers[0].submerchantAmount).toBe(88);
  });

  it("hold'da kesinti (adjustment) sonrası düşürülmüş net yükseltilmez", async () => {
    // netAmount hold'un hak ettiğinden DÜŞÜKse (satıcı kesintisi/adjustment)
    // yeniden hesap onu YÜKSELTMEMELİ — yalnız aşağı yönlü düzeltme yapılır.
    const payout = {
      id: "p4",
      sellerId: "s1",
      status: PayoutStatus.pending,
      netAmount: 40, // adjustment ile düşürülmüş
      amount: 100,
      commission: 12,
      merchantOid: "OID4",
      transId: "T4",
      transferIban: "TR330006100519786457841326",
      transferName: "Satici",
      paymentHold: {
        paymentId: "pay1",
        orderId: "o1",
        amount: 88,
        refundedAmount: 0,
      },
      tradeCashPayment: null,
    };
    const { service, transfers } = makeService(payout, order);

    await service.processPendingPayouts();

    expect(transfers).toHaveLength(1);
    expect(transfers[0].submerchantAmount).toBe(40);
  });
});
