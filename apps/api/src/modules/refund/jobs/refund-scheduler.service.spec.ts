import { BadRequestException, Logger } from "@nestjs/common";
import { i18nMessage } from "../../i18n/localized-message";
import { CronStepFailuresError } from "../../../monitoring/cron-step-runner";
import { RefundSchedulerService } from "./refund-scheduler.service";

/**
 * Each refund the cron cannot finalize is its own error line (with its id):
 * that line is the alarm. The run summary only counts them, so it is marked
 * already reported and the cron tracker keeps it out of Sentry; before, one
 * stuck refund was two Sentry events every 10 minutes (TARODAN-API-2).
 */
describe("RefundSchedulerService.runRefundCrons failure reporting", () => {
  const REFUND_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const makeService = (finalize: jest.Mock) => {
    const refundService = {
      findPendingDeliveryToOpenReturn: jest.fn().mockResolvedValue([]),
      openReturnShipment: jest.fn(),
      findReturnDeliveredPendingFinalize: jest
        .fn()
        .mockResolvedValue([REFUND_ID]),
      finalizeRefundForReturnedShipment: finalize,
      expireStaleOpenReturns: jest.fn().mockResolvedValue(0),
      expireStaleWaitForDelivery: jest.fn().mockResolvedValue(0),
    };
    type Deps = ConstructorParameters<typeof RefundSchedulerService>;
    return new RefundSchedulerService(
      refundService as unknown as Deps[0],
      {} as Deps[1],
    );
  };

  it("logs the failed refund with its id and real reason, then fails the run as already reported", async () => {
    const service = makeService(
      jest
        .fn()
        .mockRejectedValue(
          new BadRequestException(
            i18nMessage("server.payment.orderAlreadyRefunded"),
          ),
        ),
    );

    const run = service.runRefundCrons();

    await expect(run).rejects.toBeInstanceOf(CronStepFailuresError);
    await expect(run).rejects.toMatchObject({ alreadyReported: true });
    expect(error).toHaveBeenCalledTimes(1);
    const [line] = error.mock.calls[0];
    expect(line).toContain(REFUND_ID);
    // The catalog key, not "Bad Request Exception".
    expect(line).toContain("server.payment.orderAlreadyRefunded");
  });

  it("succeeds without an error line when every refund finalizes", async () => {
    const service = makeService(jest.fn().mockResolvedValue(undefined));

    await expect(service.runRefundCrons()).resolves.toMatchObject({
      stats: expect.objectContaining({ finalized: 1, failed: 0 }),
    });
    expect(error).not.toHaveBeenCalled();
  });
});
