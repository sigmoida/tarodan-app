import { EscrowHoldService } from "./escrow-hold.service";
import { PaymentHoldStatus } from "@prisma/client";

/**
 * Escrow hold davranışı. Sürat faturası PLATFORMA geldiğinden hold'a kargonun
 * HİÇBİR kısmı girmez: sellerAmount = total − komisyon − stopaj − TAM kargo +
 * platform-fonlu indirim. Alıcının ödediği kargo payı + satıcıdan kesilen pay
 * platformda kalır ve Sürat maliyetini karşılar. Negatif sonuç 0'a sabitlenir
 * ve açık, satıcıya shipping_deficit borcu olarak yazılır (payout mahsubu).
 */
describe("EscrowHoldService.createHold", () => {
  const makeOrder = (over: Record<string, any> = {}) => ({
    id: "o1",
    // ürün 1000 + alıcı kargo payı 91 + alıcı ücreti 30 = 1121
    totalAmount: 1121,
    commissionAmount: 130,
    withholdingTaxAmount: 0,
    sellerId: "s1",
    sellerFeeAmount: 100,
    buyerFeeAmount: 30,
    buyerShippingAmount: 91,
    sellerShippingAmount: 39,
    shippingCost: 91,
    ...over,
  });

  const makeTx = () =>
    ({
      paymentHold: { create: jest.fn().mockResolvedValue({}) },
      sellerAccountAdjustment: { upsert: jest.fn().mockResolvedValue({}) },
    }) as any;

  const makeSvc = () => {
    const commissionLedger = {
      upsertPending: jest.fn().mockResolvedValue(undefined),
    } as any;
    return { svc: new EscrowHoldService(commissionLedger), commissionLedger };
  };

  it("hold = total − komisyon − stopaj − TAM kargo; held + releaseAt null; komisyon pending upsert", async () => {
    const { svc, commissionLedger } = makeSvc();
    const tx = makeTx();

    await svc.createHold(tx, makeOrder(), "pay-1");

    expect(tx.paymentHold.create).toHaveBeenCalledWith({
      data: {
        paymentId: "pay-1",
        orderId: "o1",
        sellerId: "s1",
        amount: 861, // 1121 − 130 − 0 − (91 + 39)
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });
    expect(commissionLedger.upsertPending).toHaveBeenCalledWith({
      orderId: "o1",
      sellerCommission: 100,
      buyerFee: 30,
      tx,
    });
    expect(tx.sellerAccountAdjustment.upsert).not.toHaveBeenCalled();
  });

  it("stopaj düşülür; undefined stopaj 0 kabul edilir", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    await svc.createHold(tx, makeOrder({ withholdingTaxAmount: 10 }), "pay-2");
    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(851);

    const tx2 = makeTx();
    await svc.createHold(
      tx2,
      makeOrder({ withholdingTaxAmount: undefined }),
      "pay-3",
    );
    expect(tx2.paymentHold.create.mock.calls[0][0].data.amount).toBe(861);
  });

  it("pay kolonları boşsa legacy shippingCost tam kargo kabul edilir", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    await svc.createHold(
      tx,
      makeOrder({
        totalAmount: 1090,
        buyerShippingAmount: undefined,
        sellerShippingAmount: undefined,
        shippingCost: 60,
      }),
      "pay-4",
    );

    // 1090 − 130 − 60
    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(900);
  });

  it("kargosuz (üyelik/dijital) siparişte kargo düşümü olmaz", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    await svc.createHold(
      tx,
      makeOrder({
        totalAmount: 1000,
        commissionAmount: 100,
        buyerFeeAmount: 0,
        sellerFeeAmount: 100,
        buyerShippingAmount: 0,
        sellerShippingAmount: 0,
        shippingCost: 0,
      }),
      "pay-5",
    );

    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(900);
  });

  it("platform-fonlu kampanya payı satıcıya geri eklenir", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    await svc.createHold(
      tx,
      makeOrder({ platformFundedDiscount: 50 }),
      "pay-6",
    );

    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(911); // 861 + 50
  });

  it("negatif hold 0'a sabitlenir ve açık shipping_deficit borcu yazılır", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    // Grup sepetinde kargo satıcının İLK satırına yüklenir: 20 TL'lik ilk satır +
    // 130 TL tam kargo → satır hold'u negatife düşer.
    await svc.createHold(
      tx,
      makeOrder({
        totalAmount: 113, // 20 ürün + 91 alıcı kargo payı + 2 alıcı ücreti
        commissionAmount: 4,
        sellerFeeAmount: 2,
        buyerFeeAmount: 2,
      }),
      "pay-7",
    );

    // 113 − 4 − 130 = −21 → hold 0, borç 21
    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(0);
    expect(tx.sellerAccountAdjustment.upsert).toHaveBeenCalledWith({
      where: { sourceKey: "shipping-deficit:o1" },
      create: expect.objectContaining({
        sellerId: "s1",
        orderId: "o1",
        sourceKey: "shipping-deficit:o1",
        type: "shipping_deficit",
        amount: 21,
        remainingAmount: 21,
      }),
      update: {},
    });
  });

  it("kuruş yuvarlaması: hold 2 haneye yuvarlanır", async () => {
    const { svc } = makeSvc();
    const tx = makeTx();

    await svc.createHold(
      tx,
      makeOrder({
        totalAmount: 100.115,
        commissionAmount: 10.005,
        buyerShippingAmount: 5.055,
        sellerShippingAmount: 0,
        shippingCost: 5.055,
      }),
      "pay-8",
    );

    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(85.06);
  });
});
