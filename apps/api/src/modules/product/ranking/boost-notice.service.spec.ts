import { Prisma } from "@prisma/client";
import { BoostNoticeService } from "./boost-notice.service";
import { NotificationType } from "../../notification/dto";

/**
 * Seller notices of staff boost actions go through the outbox: the handler is
 * registered, sends one bell + push to the boost's seller with the copy's
 * values, and the immediate send never fails the staff action.
 */
describe("BoostNoticeService", () => {
  const make = (
    boost: Record<string, unknown> | null = {
      userId: "seller-1",
      productId: "prod-1",
      durationDays: 7,
      refundedAmount: new Prisma.Decimal("20.50"),
      product: { title: "Hot Wheels 1:64" },
    },
  ) => {
    const prisma = {
      productBoost: { findUnique: jest.fn().mockResolvedValue(boost) },
    };
    const outbox = {
      runInline: jest.fn(
        async (_db: unknown, _key: string, work: () => Promise<unknown>) => ({
          ran: true,
          result: await work(),
        }),
      ),
    };
    const registry = { register: jest.fn() };
    const notifications = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
    };
    const service = new BoostNoticeService(
      prisma as never,
      outbox as never,
      registry as never,
      notifications as never,
    );
    return { service, prisma, outbox, registry, notifications };
  };

  it("registers the outbox handler", () => {
    const { service, registry } = make();

    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(
      "boost.notice",
      expect.any(Function),
    );
  });

  it.each([
    ["granted", NotificationType.BOOST_GRANTED, { days: 7 }],
    ["cancelled", NotificationType.BOOST_CANCELLED, {}],
    ["refunded", NotificationType.BOOST_REFUNDED, { amount: 20.5 }],
  ] as const)(
    "%s: tells the seller, the record before the push",
    async (kind, type, extra) => {
      const { service, notifications } = make();

      await service.send({ boostId: "boost-1", kind });

      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "seller-1",
        type,
        { productId: "prod-1", productTitle: "Hot Wheels 1:64", ...extra },
        { pushRequiresRecord: true },
      );
    },
  );

  it("has nobody to tell when the boost is gone", async () => {
    const { service, notifications } = make(null);

    await service.send({ boostId: "boost-1", kind: "granted" });

    expect(notifications.createInAppNotification).not.toHaveBeenCalled();
  });

  it("flush runs the queued row by its dedupe key", async () => {
    const { service, outbox, notifications } = make();

    await service.flush({ boostId: "boost-1", kind: "refunded" });

    expect(outbox.runInline).toHaveBeenCalledWith(
      expect.anything(),
      "boost.notice:refunded:boost-1",
      expect.any(Function),
    );
    expect(notifications.createInAppNotification).toHaveBeenCalledTimes(1);
  });

  it("flush never throws: a failed send stays for the drainer", async () => {
    const { service, notifications } = make();
    notifications.createInAppNotification.mockRejectedValue(new Error("down"));

    await expect(
      service.flush({ boostId: "boost-1", kind: "cancelled" }),
    ).resolves.toBeUndefined();
  });
});
