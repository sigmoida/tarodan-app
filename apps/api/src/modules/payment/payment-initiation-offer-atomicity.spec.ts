import { PaymentInitiationService } from "./payment-initiation.service";
import { Prisma } from "@prisma/client";

/**
 * #3 (atomiklik): Teklif siparişinde ilk ödeme başlatmada stok rezervasyonu + Payment
 * intent AYNI transaction'da oluşur. Payment.orderId UNIQUE → iki eşzamanlı ilk-ödeme
 * yarışında biri P2002 alıp rollback olur (çift-reserve yok), diğeri kazananın Payment'ını
 * reuse eder; reserve↔Payment gap'i kapanır.
 */
describe("PaymentInitiationService — teklif reserve+Payment atomikliği (#3)", () => {
  const STOP = new Error("__stop_after_reserve__");

  const makeService = (txCreateBehavior: "ok" | "p2002") => {
    const calls: any = { reserve: undefined, txCreate: false };
    const tx = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(null), // tx içi: mevcut Payment yok
        create: jest.fn().mockImplementation((arg: any) => {
          calls.txCreate = true;
          if (txCreateBehavior === "p2002") {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError("dup", {
                code: "P2002",
                clientVersion: "5.x",
              }),
            );
          }
          return Promise.resolve({ id: "pay-new", ...arg.data });
        }),
      },
    };
    const prisma = {
      payment: {
        // 1184: mevcut pending Payment yok → first-time dalına düşer
        findFirst: jest.fn().mockResolvedValue(null),
        // 1303: reserve dalından SONRAKİ ilk çağrı → sentinel ile durdur
        findUnique: jest.fn().mockRejectedValue(STOP),
      },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const productLockService = {
      checkAndReserve: jest
        .fn()
        .mockImplementation((_tx: any, productId: string, qty: number) => {
          calls.reserve = { productId, qty };
          return Promise.resolve();
        }),
    } as any;
    const config = { get: jest.fn().mockReturnValue(undefined) } as any;
    const service = new PaymentInitiationService(
      prisma,
      config,
      {} as any,
      productLockService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, calls, tx };
  };

  const offerOrder = {
    id: "o1",
    offerId: "off1",
    reservationReleasedAt: null,
    productId: "p1",
    quantity: 2,
    totalAmount: 100,
  };

  it("ilk ödeme: reserve + Payment create AYNI tx'te yapılır", async () => {
    const { service, calls, tx } = makeService("ok");

    await expect(
      (service as any).processPaymentInitiation(offerOrder, { orderId: "o1" }),
    ).rejects.toBe(STOP);

    expect(calls.reserve).toEqual({ productId: "p1", qty: 2 });
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.create.mock.calls[0][0].data.orderId).toBe("o1");
  });

  it("eşzamanlı yarış: tx P2002 → yutulur, akış devam eder (500 değil)", async () => {
    const { service, calls } = makeService("p2002");

    // P2002 catch edilir; akış 1303'teki sentinel'e kadar devam eder (P2002 DEĞİL STOP fırlatır)
    await expect(
      (service as any).processPaymentInitiation(offerOrder, { orderId: "o1" }),
    ).rejects.toBe(STOP);

    expect(calls.reserve).toEqual({ productId: "p1", qty: 2 });
    expect(calls.txCreate).toBe(true);
  });
});
