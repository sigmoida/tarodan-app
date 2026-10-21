import { BadRequestException } from "@nestjs/common";
import { AdminAdPackageService } from "./admin-ad-package.service";

/**
 * Staff pause, resume and extend change a listing's boost timeline. The
 * listing lock (`SELECT ... FOR UPDATE`) only holds inside a transaction, so
 * each action must hand the timeline owner the transaction client, never the
 * plain Prisma client (where the lock would end with its own statement).
 */
describe("AdminAdPackageService boost actions", () => {
  const make = () => {
    const tx = { marker: "tx" };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      productBoost: { findUnique: jest.fn(), findMany: jest.fn() },
    };
    const timeline = {
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      extend: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminAdPackageService(
      prisma as never,
      timeline as never,
    );
    const getPurchase = jest
      .spyOn(service, "getPurchase")
      .mockResolvedValue({ id: "boost-1" } as never);
    return { service, prisma, tx, timeline, getPurchase };
  };

  it.each([
    ["pause", (s: AdminAdPackageService) => s.pausePurchase("boost-1"), []],
    ["resume", (s: AdminAdPackageService) => s.resumePurchase("boost-1"), []],
    [
      "extend",
      (s: AdminAdPackageService) => s.extendPurchase("boost-1", 5),
      [5],
    ],
  ] as const)(
    "%s runs through the timeline in one transaction, then returns the purchase",
    async (action, run, extra) => {
      const { service, prisma, tx, timeline, getPurchase } = make();

      await expect(run(service)).resolves.toEqual({ id: "boost-1" });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(timeline[action]).toHaveBeenCalledWith(tx, "boost-1", ...extra);
      // The purchase is read after the transaction committed.
      expect(timeline[action].mock.invocationCallOrder[0]).toBeLessThan(
        getPurchase.mock.invocationCallOrder[0],
      );
    },
  );

  it("passes a refusal through and reads no purchase", async () => {
    const { service, timeline, getPurchase } = make();
    timeline.pause.mockRejectedValue(
      new BadRequestException({
        i18nKey: "server.admin.adPackage.pauseActiveOnly",
      }),
    );

    await expect(service.pausePurchase("boost-1")).rejects.toMatchObject({
      response: { i18nKey: "server.admin.adPackage.pauseActiveOnly" },
    });
    expect(getPurchase).not.toHaveBeenCalled();
  });
});
