import { ConflictException } from "@nestjs/common";
import { TestLaneService } from "./test-lane.service";

jest.mock("bcrypt", () => ({ hash: jest.fn(async () => "hashed") }));

/**
 * Test şeridi yönetimi: hesap doğrulanmış + adresli + isTestAccount açılır;
 * sıfırlama yalnız şerit damgalı / test hesabına bağlı satırları siler ve
 * FK zincirine uygun sırada ilerler.
 */
describe("TestLaneService", () => {
  const build = () => {
    const calls: string[] = [];
    const del = (name: string, count = 0) => ({
      deleteMany: jest.fn(async () => {
        calls.push(name);
        return { count };
      }),
    });
    const tx: Record<string, any> = {
      ledgerEntry: del("ledgerEntry"),
      refundAttempt: del("refundAttempt"),
      refundFinancialComponent: del("refundFinancialComponent"),
      refundRequest: del("refundRequest"),
      payoutTransfer: del("payoutTransfer"),
      paymentHold: del("paymentHold"),
      shipmentEvent: del("shipmentEvent"),
      shipment: del("shipment"),
      rating: del("rating"),
      invoice: del("invoice"),
      commissionLedger: del("commissionLedger"),
      paymentProviderEvent: del("paymentProviderEvent"),
      payment: del("payment", 2),
      order: del("order", 3),
      packageShippingSettlement: del("packageShippingSettlement"),
      orderPackage: del("orderPackage"),
      checkoutGroup: del("checkoutGroup"),
      trade: del("trade", 1),
      offer: del("offer"),
      cartItem: del("cartItem"),
      product: { updateMany: jest.fn(async () => ({ count: 1 })) },
      user: {
        create: jest.fn(async ({ data }: any) => ({
          id: "u-new",
          adminCode: "B000123",
          email: data.email,
          displayName: data.displayName,
          isSeller: data.isSeller,
          createdAt: new Date("2026-09-08"),
        })),
      },
      address: { create: jest.fn(async () => ({})) },
    };
    const prisma: Record<string, any> = {
      user: {
        findMany: jest.fn(async () => [{ id: "t1" }, { id: "t2" }]),
        findFirst: jest.fn(async () => null),
      },
      order: { findMany: jest.fn(async () => [{ id: "o1" }]) },
      payment: { findMany: jest.fn(async () => [{ id: "p1" }]) },
      orderPackage: { findMany: jest.fn(async () => [{ id: "k1" }]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    const lanes = { invalidate: jest.fn() };
    const service = new TestLaneService(prisma as never, lanes as never);
    return { service, prisma, tx, calls, lanes };
  };

  describe("createAccount", () => {
    it("creates a verified, addressed test account and drops the lane cache", async () => {
      const { service, tx, lanes } = build();
      const row = await service.createAccount({
        email: "Review@Tarodan.com.tr",
        password: "Secret123!",
        displayName: "Reviewer",
        isSeller: true,
        phone: "+905000000001",
      });
      const data = tx.user.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        email: "review@tarodan.com.tr",
        passwordHash: "hashed",
        isTestAccount: true,
        isVerified: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isSeller: true,
        sellerType: "individual",
      });
      expect(tx.address.create.mock.calls[0][0].data).toMatchObject({
        userId: "u-new",
        isDefault: true,
        phone: "+905000000001",
      });
      expect(lanes.invalidate).toHaveBeenCalledWith("u-new");
      expect(row).toMatchObject({ id: "u-new", orders: 0, listings: 0 });
    });

    it("refuses a duplicate email/phone with 409", async () => {
      const { service, prisma } = build();
      prisma.user.findFirst.mockResolvedValue({ id: "dup" });
      await expect(
        service.createAccount({
          email: "dup@x.com",
          password: "Secret123!",
          displayName: "Dup",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("resetLane", () => {
    it("deletes only lane-stamped rows in FK order and reactivates sold listings", async () => {
      const { service, tx, calls } = build();
      const result = await service.resetLane();

      expect(calls).toEqual([
        "ledgerEntry",
        "refundAttempt",
        "refundFinancialComponent",
        "refundRequest",
        "payoutTransfer",
        "paymentHold",
        "shipmentEvent",
        "shipment",
        "rating",
        "invoice",
        "commissionLedger",
        "paymentProviderEvent",
        "payment",
        "order",
        "packageShippingSettlement",
        "orderPackage",
        "checkoutGroup",
        "trade",
        "offer",
        "cartItem",
      ]);
      expect(tx.ledgerEntry.deleteMany).toHaveBeenCalledWith({
        where: { isTest: true },
      });
      expect(tx.payment.deleteMany).toHaveBeenCalledWith({
        where: { isTest: true },
      });
      expect(tx.order.deleteMany).toHaveBeenCalledWith({
        where: { isTest: true },
      });
      expect(tx.rating.deleteMany).toHaveBeenCalledWith({
        where: { orderId: { in: ["o1"] } },
      });
      expect(tx.offer.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { buyerId: { in: ["t1", "t2"] } },
            { sellerId: { in: ["t1", "t2"] } },
          ],
        },
      });
      expect(tx.product.updateMany.mock.calls[0][0]).toMatchObject({
        where: { sellerId: { in: ["t1", "t2"] }, status: "sold" },
        data: { status: "active", quantity: 1 },
      });
      expect(result).toEqual({
        accounts: 2,
        deleted: expect.objectContaining({ orders: 3, payments: 2, trades: 1 }),
        listingsReactivated: 1,
      });
    });

    it("refuses to run when there is no test account", async () => {
      const { service, prisma } = build();
      prisma.user.findMany.mockResolvedValue([]);
      await expect(service.resetLane()).rejects.toMatchObject({ status: 404 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
