import { Prisma } from "@prisma/client";
import { OrderCommonService } from "./order-common.service";

/**
 * The order detail payment block carries the payment's installment count,
 * fee, charged amount and card for the BUYER (ADR 0019, plan 5.2); the
 * seller sees the same block without them. A cart order reads its cart's
 * payment.
 */
describe("formatOrderResponse payment installment fields", () => {
  const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
  const service = () =>
    new OrderCommonService(
      {
        productRating: { findFirst: jest.fn().mockResolvedValue(null) },
        rating: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { getPublicAssetUrl: (k: string) => `https://cdn/${k}` } as never,
    );

  const cartPayment = {
    id: "pay-1",
    status: "completed",
    amount: D("1000.00"),
    chargedAmount: D("1066.38"),
    installmentCount: 3,
    chargeAttempt: { cardFamily: "world", cardBank: "Test Bank" },
    provider: "paytr",
    failureReason: null,
  };
  const order = {
    id: "order-1",
    orderNumber: "ORD-NGGCF4J4V4",
    productId: "3f1c2a7e-0d4b-4c1e-9a55-5d8f0b7c2e11",
    origin: "direct_sale",
    status: "preparing",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    totalAmount: D("600.00"),
    shippingAddress: { fullName: "Alici", city: "Istanbul" },
    buyer: { id: "buyer-1", username: "alici" },
    seller: { id: "seller-1", username: "satici" },
    payment: null,
    checkoutGroup: { payment: cartPayment },
  };

  it("shows the buyer the cart payment's installment details", async () => {
    const result = await service().formatOrderResponse(order, "buyer-1");
    expect(result.payment).toMatchObject({
      id: "pay-1",
      amount: 1000,
      installmentCount: 3,
      installmentFeeAmount: 66.38,
      chargedAmount: 1066.38,
      cardFamily: "world",
      cardBank: "Test Bank",
    });
  });

  it("shows the seller the payment block without them", async () => {
    const result = await service().formatOrderResponse(order, "seller-1");
    expect(result.payment).toMatchObject({ id: "pay-1", amount: 1000 });
    for (const field of [
      "installmentCount",
      "installmentFeeAmount",
      "chargedAmount",
      "cardFamily",
      "cardBank",
    ]) {
      expect(result.payment).not.toHaveProperty(field);
    }
  });
});
