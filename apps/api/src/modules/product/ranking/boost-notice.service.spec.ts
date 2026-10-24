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
      productBoost: {
        findUnique: jest.fn().mockResolvedValue(boost),
        // No running boost of the listing ends later (a reminder still holds).
        count: jest.fn().mockResolvedValue(0),
      },
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

  describe("expire-boosts notices", () => {
    const NOW = new Date("2026-10-21T12:00:00.000Z");
    const running = {
      userId: "seller-1",
      productId: "prod-1",
      durationDays: 7,
      refundedAmount: null,
      status: "active",
      endsAt: new Date("2026-10-21T20:00:00.000Z"),
      product: { title: "Hot Wheels 1:64" },
    };

    it.each([
      ["ending_soon", NotificationType.BOOST_ENDING_SOON],
      ["expired", NotificationType.BOOST_EXPIRED],
    ] as const)(
      "%s: tells the seller with the listing's title",
      async (kind, type) => {
        const { service, notifications } = make(running);

        await service.send({ boostId: "boost-1", kind }, NOW);

        expect(notifications.createInAppNotification).toHaveBeenCalledWith(
          "seller-1",
          type,
          { productId: "prod-1", productTitle: "Hot Wheels 1:64" },
          { pushRequiresRecord: true },
        );
      },
    );

    it.each([
      ["has ended", { endsAt: new Date("2026-10-21T11:00:00.000Z") }],
      ["was stopped", { status: "cancelled" }],
    ])(
      "drops an ending-soon reminder delivered late, once the boost %s",
      async (_name, over) => {
        const { service, notifications } = make({ ...running, ...over });

        await service.send(
          { boostId: "boost-1", kind: "ending_soon", at: NOW.toISOString() },
          NOW,
        );

        expect(notifications.createInAppNotification).not.toHaveBeenCalled();
      },
    );

    it("drops a reminder delivered after the end moved past the window (an extension)", async () => {
      const { service, notifications } = make({
        ...running,
        endsAt: new Date("2026-10-24T12:00:00.000Z"),
      });

      await service.send(
        { boostId: "boost-1", kind: "ending_soon", at: NOW.toISOString() },
        NOW,
      );

      expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    });

    it("drops a reminder delivered after a stacked purchase (no longer the tail)", async () => {
      const { service, prisma, notifications } = make(running);
      prisma.productBoost.count.mockResolvedValueOnce(1);

      await service.send(
        { boostId: "boost-1", kind: "ending_soon", at: NOW.toISOString() },
        NOW,
      );

      expect(prisma.productBoost.count).toHaveBeenCalledWith({
        where: {
          productId: "prod-1",
          status: "active",
          endsAt: { gt: running.endsAt },
        },
      });
      expect(notifications.createInAppNotification).not.toHaveBeenCalled();
    });

    it("an expiry notice is sent although the boost no longer runs", async () => {
      const { service, notifications } = make({
        ...running,
        status: "expired",
        endsAt: new Date("2026-10-21T11:00:00.000Z"),
      });

      await service.send({ boostId: "boost-1", kind: "expired" }, NOW);

      expect(notifications.createInAppNotification).toHaveBeenCalledTimes(1);
    });

    it("flush keys a reminder by its claim stamp", async () => {
      const { service, outbox } = make(running);

      await service.flush({
        boostId: "boost-1",
        kind: "ending_soon",
        at: "2026-10-21T12:00:00.000Z",
      });

      expect(outbox.runInline).toHaveBeenCalledWith(
        expect.anything(),
        "boost.notice:ending_soon:boost-1:2026-10-21T12:00:00.000Z",
        expect.any(Function),
      );
    });
  });

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
