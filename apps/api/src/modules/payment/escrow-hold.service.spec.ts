import { EscrowHoldService } from "./escrow-hold.service";
import { PaymentHoldStatus } from "@prisma/client";

/**
 * Karakterizasyon: escrow hold davranışı (god-service'ten çıkarılan mantık aynen korunmalı).
 * sellerAmount = total − komisyon − stopaj; hold status=held, releaseAt=null; komisyon
 * defter satırı pending upsert.
 */
describe("EscrowHoldService.createHold", () => {
  const makeOrder = (over: Record<string, any> = {}) => ({
    id: "o1",
    totalAmount: 100,
    commissionAmount: 15,
    withholdingTaxAmount: 3,
    sellerId: "s1",
    sellerFeeAmount: 12,
    buyerFeeAmount: 3,
    ...over,
  });

  it("hold = total − komisyon − stopaj; held + releaseAt null; komisyon pending upsert", async () => {
    const commissionLedger = {
      upsertPending: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tx = {
      paymentHold: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const svc = new EscrowHoldService(commissionLedger);

    await svc.createHold(tx, makeOrder(), "pay-1");

    expect(tx.paymentHold.create).toHaveBeenCalledWith({
      data: {
        paymentId: "pay-1",
        orderId: "o1",
        sellerId: "s1",
        amount: 82, // 100 − 15 − 3
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });
    expect(commissionLedger.upsertPending).toHaveBeenCalledWith({
      orderId: "o1",
      sellerCommission: 12,
      buyerFee: 3,
      tx,
    });
  });

  it("stopaj yoksa (undefined) 0 kabul edilir", async () => {
    const commissionLedger = {
      upsertPending: jest.fn().mockResolvedValue(undefined),
    } as any;
    const tx = {
      paymentHold: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const svc = new EscrowHoldService(commissionLedger);

    await svc.createHold(
      tx,
      makeOrder({ withholdingTaxAmount: undefined }),
      "pay-2",
    );

    expect(tx.paymentHold.create.mock.calls[0][0].data.amount).toBe(85); // 100 − 15 − 0
  });
});
