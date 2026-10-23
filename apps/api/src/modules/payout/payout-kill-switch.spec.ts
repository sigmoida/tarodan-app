import { PayoutService } from "./payout.service";

/**
 * D1 staging guard, payout side: the staging database is a masked copy of
 * production, full of payouts that are due. They are kept away from PayTR by
 * the kill switch, not by a second copy filter: staging cannot boot without
 * `PAYOUTS_DISABLED=true` (`env.validation.spec.ts`), and with it the payout
 * run sends nothing and reads no payout row. This pins the second half.
 */
describe("PayoutService.processPendingPayouts with PAYOUTS_DISABLED=true", () => {
  it("sends no transfer and reads no payout", async () => {
    const prisma = { payoutTransfer: { findMany: jest.fn() } };
    const createPlatformTransfer = jest.fn();
    const service = new PayoutService(
      prisma as never,
      { resolve: () => ({ createPlatformTransfer }) } as never,
      {
        get: jest.fn((key: string) =>
          key === "PAYOUTS_DISABLED" ? "true" : undefined,
        ),
      } as never,
      {} as never,
    );
    jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        "warn",
      )
      .mockImplementation(() => undefined);

    await expect(service.processPendingPayouts()).resolves.toEqual({
      processed: 0,
      submitted: 0,
      failed: 0,
    });
    expect(prisma.payoutTransfer.findMany).not.toHaveBeenCalled();
    expect(createPlatformTransfer).not.toHaveBeenCalled();
  });
});
