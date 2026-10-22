import { BadRequestException } from "@nestjs/common";
import { TradeStatus } from "@prisma/client";
import { TradeLifecycleService } from "./trade-lifecycle.service";

/**
 * Trade cash on create and counter: a bad amount (third decimal, exponent
 * form, above the 9,999,999 ceiling) is a 400 with
 * `server.trade.invalidCashAmount` before anything is read or written, and a
 * valid one keeps its sign semantics: positive = the proposer pays, negative
 * = the other side pays, stored as the magnitude.
 */
describe("TradeLifecycleService — trade cash amount", () => {
  const HOUR = 60 * 60 * 1000;

  const build = () => {
    const trade = {
      id: "t1",
      version: 3,
      status: TradeStatus.pending,
      initiatorId: "u1",
      receiverId: "u2",
      cashAmount: null,
      cashPayerId: null,
      responseDeadline: new Date(Date.now() + HOUR),
      responseExtendedAt: null,
      items: [
        { productId: "a", side: "initiator", quantity: 1 },
        { productId: "b", side: "receiver", quantity: 1 },
      ],
    };
    const txTradeUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      tradeItem: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      trade: { update: txTradeUpdate },
    };
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(trade) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: "c", price: 10, quantity: null }])
          .mockResolvedValueOnce([{ id: "d", price: 10, quantity: null }]),
      },
      tradeItem: {
        findMany: jest.fn().mockResolvedValue([{ productId: "a" }]),
      },
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
      user: { findUnique: jest.fn().mockResolvedValue({ id: "u2" }) },
    };
    const service = Object.create(TradeLifecycleService.prototype);
    Object.assign(service, {
      prisma,
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
      assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      membershipService: {
        canCreateTrade: jest.fn().mockResolvedValue({ allowed: true }),
      },
      tradeShipment: {
        resolveTradeShippingAddressId: jest.fn().mockResolvedValue(null),
      },
      tradeCommon: { invalidateProductCaches: jest.fn() },
      notificationService: {
        createInAppNotification: jest.fn().mockResolvedValue(true),
      },
      tradeQuery: { getTradeById: jest.fn().mockResolvedValue({}) },
    });
    return { service: service as TradeLifecycleService, prisma, txTradeUpdate };
  };

  const items = {
    initiatorItems: [{ productId: "c", quantity: 1 }],
    receiverItems: [{ productId: "d", quantity: 1 }],
  };

  const expectInvalidCash = (error: unknown) => {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      i18nKey: "server.trade.invalidCashAmount",
    });
  };

  describe.each([59.999, -59.999, 1e-7, 10_000_000, -99_999_999.99])(
    "cash %p",
    (cashAmount) => {
      it("createTrade refuses it before any read", async () => {
        const { service, prisma } = build();
        const error = await service
          .createTrade("u1", {
            receiverId: "u2",
            ...items,
            cashAmount,
          } as never)
          .catch((e: unknown) => e);
        expectInvalidCash(error);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
      });

      it("counterTrade refuses it before any read", async () => {
        const { service, prisma } = build();
        const error = await service
          .counterTrade("t1", "u2", { ...items, cashAmount } as never)
          .catch((e: unknown) => e);
        expectInvalidCash(error);
        expect(prisma.trade.findUnique).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    // The counter-offerer (u2) becomes the initiator: positive = u2 pays.
    [250.5, { cashAmount: 250.5, cashPayerId: "u2" }],
    // Negative = the original initiator (u1) pays, stored as the magnitude.
    [-250.5, { cashAmount: 250.5, cashPayerId: "u1" }],
    [9_999_999, { cashAmount: 9_999_999, cashPayerId: "u2" }],
    [0, { cashAmount: null, cashPayerId: null }],
    [-0, { cashAmount: null, cashPayerId: null }],
    [undefined, { cashAmount: null, cashPayerId: null }],
  ])("counterTrade stores cash %p as %p", async (cashAmount, stored) => {
    const { service, txTradeUpdate } = build();
    await service.counterTrade("t1", "u2", { ...items, cashAmount } as never);
    expect(txTradeUpdate.mock.calls[0][0].data).toMatchObject(stored);
  });

  it.each([
    // The initiator (u1) proposes: positive = u1 pays.
    [250.5, { cashAmount: 250.5, cashPayerId: "u1" }],
    // Negative = the receiver (u2) pays, stored as the magnitude.
    [-250.5, { cashAmount: 250.5, cashPayerId: "u2" }],
    [-9_999_999, { cashAmount: 9_999_999, cashPayerId: "u2" }],
    [0, { cashAmount: null, cashPayerId: null }],
    [-0, { cashAmount: null, cashPayerId: null }],
    [undefined, { cashAmount: null, cashPayerId: null }],
  ])("createTrade stores cash %p as %p", async (cashAmount, stored) => {
    const { service, prisma } = build();
    // No active trade holds the offered item on create.
    prisma.tradeItem.findMany.mockResolvedValue([]);
    const STOP = new Error("stop");
    const tradeCreate = jest.fn().mockRejectedValue(STOP);
    prisma.$transaction.mockImplementation((fn) =>
      fn({
        $queryRaw: jest.fn().mockResolvedValue([]),
        trade: { create: tradeCreate },
      }),
    );
    Object.assign(service, {
      generateTradeNumber: jest.fn().mockResolvedValue("TR-1"),
      screenNewTradeMessage: jest
        .fn()
        .mockResolvedValue({ text: null, recordFlag: jest.fn() }),
    });

    const error = await service
      .createTrade("u1", { receiverId: "u2", ...items, cashAmount } as never)
      .catch((e: unknown) => e);

    expect(error).toBe(STOP);
    expect(tradeCreate.mock.calls[0][0].data).toMatchObject(stored);
  });
});
