import { PayoutService } from "./payout.service";
import { OrderStatus } from "@prisma/client";

/**
 * #1 (KRİTİK — para kaybı): createPayoutsForReleasedHolds, siparişi payment.order
 * üzerinden yüklüyordu. Grup/sepet ödemelerinde Payment.orderId=null (ödeme
 * checkoutGroupId'ye bağlıdır, tekil order'a değil) → payment.order=null → eski
 * `if (!payment?.order) continue` her grup hold'unu ATLIYORDU → grup siparişlerinin
 * satıcıları HİÇ payout almıyordu. Fix: order'ı hold.orderId üzerinden yükle.
 */
describe("PayoutService.createPayoutsForReleasedHolds — grup ödeme payout (#1)", () => {
  const makeService = (opts: { paymentHasOrder: boolean }) => {
    // Grup ödemesi: Payment.orderId=null, order alanı YOK. Hold ise orderId taşır.
    const hold = {
      id: "hold-g1",
      orderId: "o-group-1",
      amount: 100,
      refundedAmount: 0,
      sellerId: "s1",
      payment: opts.paymentHasOrder
        ? {
            providerConversationId: "OID",
            order: { orderNumber: "SHOULD_NOT_USE" },
          }
        : { providerConversationId: null, orderId: null },
      seller: {
        bankAccount: {
          iban: "TR330006100519786457841326",
          accountHolder: "Seller",
        },
      },
    };
    const order = {
      id: "o-group-1",
      orderNumber: "GRP-0001",
      status: OrderStatus.completed,
      totalAmount: 100,
      commissionAmount: 12,
      withholdingTaxAmount: 3,
    };
    const created: any[] = [];
    const prisma = {
      paymentHold: { findMany: jest.fn().mockResolvedValue([hold]) },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
      refundRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      refundAttempt: { findFirst: jest.fn().mockResolvedValue(null) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      payoutTransfer: {
        create: jest.fn().mockImplementation((arg: any) => {
          created.push(arg.data);
          return Promise.resolve({});
        }),
      },
    };
    const service = new PayoutService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma, created };
  };

  it("grup ödemesinde (payment.order YOK) payout OLUŞUR — order hold.orderId'den yüklenir", async () => {
    const { service, prisma, created } = makeService({
      paymentHasOrder: false,
    });

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(1);
    // order, orderId'lerin birleşiminden batch yüklenmeli
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["o-group-1"] } },
      }),
    );
    // PayoutTransfer alanları hold.orderId ile yüklenen order'dan gelmeli
    expect(created).toHaveLength(1);
    expect(created[0].amount).toBe(100);
    expect(created[0].commission).toBe(12);
    expect(created[0].withholdingTax).toBe(3);
    expect(created[0].paymentHoldId).toBe("hold-g1");
    expect(created[0].merchantOid).toBe("GRP0001"); // orderNumber, '-' temizlenmiş
  });

  it("order bulunamazsa (silinmiş) hold atlanır — patlamaz", async () => {
    const { service, prisma, created } = makeService({
      paymentHasOrder: false,
    });
    prisma.order.findMany.mockResolvedValue([]); // order yok

    const count = await service.createPayoutsForReleasedHolds();

    expect(count).toBe(0);
    expect(created).toHaveLength(0);
  });
});
