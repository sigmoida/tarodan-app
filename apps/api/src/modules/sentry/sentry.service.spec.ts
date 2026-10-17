import * as Sentry from "@sentry/node";
import { SentryService } from "./sentry.service";
import { attachFingerprint } from "../../common/logging/error-fingerprint";
import { attachReportKey } from "../../common/logging/error-report-key";
import type { SentryReportThrottle } from "./sentry-report-throttle";

jest.mock("@sentry/node", () => ({
  withScope: jest.fn((cb: (scope: unknown) => void) =>
    cb({
      setExtra: jest.fn(),
      setFingerprint: jest.fn(),
      setTag: jest.fn(),
    }),
  ),
  captureException: jest.fn(),
}));

describe("SentryService.captureException", () => {
  let service: SentryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SentryService();
  });

  it("sets the scope fingerprint when the error carries one", () => {
    const scope = { setExtra: jest.fn(), setFingerprint: jest.fn() };
    (Sentry.withScope as jest.Mock).mockImplementationOnce(
      (cb: (scope: unknown) => void) => cb(scope),
    );

    const error = new Error("boom");
    attachFingerprint(error, ["OrdersService", "boom"]);

    service.captureException(error);

    expect(scope.setFingerprint).toHaveBeenCalledWith([
      "OrdersService",
      "boom",
    ]);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it("does not set a fingerprint for errors created outside the logger", () => {
    const scope = { setExtra: jest.fn(), setFingerprint: jest.fn() };
    (Sentry.withScope as jest.Mock).mockImplementationOnce(
      (cb: (scope: unknown) => void) => cb(scope),
    );

    service.captureException(new Error("unrelated"));

    expect(scope.setFingerprint).not.toHaveBeenCalled();
  });

  it("still forwards extra context onto the scope", () => {
    const scope = { setExtra: jest.fn(), setFingerprint: jest.fn() };
    (Sentry.withScope as jest.Mock).mockImplementationOnce(
      (cb: (scope: unknown) => void) => cb(scope),
    );

    service.captureException(new Error("boom"), { route: "/x" });

    expect(scope.setExtra).toHaveBeenCalledWith("route", "/x");
  });
});

describe("SentryService.captureException with the repeat throttle", () => {
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const throttleAnswering = (...answers: boolean[]) => {
    const shouldReport = jest.fn();
    for (const answer of answers) shouldReport.mockResolvedValueOnce(answer);
    return {
      throttle: { shouldReport } as unknown as SentryReportThrottle,
      shouldReport,
    };
  };
  const keyed = (key: string) => {
    const error = new Error("Cron 'refund-crons' FAILED");
    attachReportKey(error, key);
    return error;
  };

  beforeEach(() => jest.clearAllMocks());

  it("sends a keyed error the throttle lets through, tagged with its key", async () => {
    const scope = {
      setExtra: jest.fn(),
      setFingerprint: jest.fn(),
      setTag: jest.fn(),
    };
    (Sentry.withScope as jest.Mock).mockImplementationOnce(
      (cb: (scope: unknown) => void) => cb(scope),
    );
    const { throttle, shouldReport } = throttleAnswering(true);
    const error = keyed("k1");

    new SentryService(throttle).captureException(error);
    await flush();

    expect(shouldReport).toHaveBeenCalledWith("k1");
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(scope.setTag).toHaveBeenCalledWith("reportKey", "k1");
  });

  it("drops a keyed repeat the throttle holds back", async () => {
    const { throttle } = throttleAnswering(false);

    new SentryService(throttle).captureException(keyed("k1"));
    await flush();

    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("always sends an unkeyed error (HTTP 5xx, worker crash) without asking", () => {
    const { throttle, shouldReport } = throttleAnswering(false);

    new SentryService(throttle).captureException(new Error("500"));

    expect(shouldReport).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("sends rather than drops when the throttle itself fails", async () => {
    const shouldReport = jest.fn().mockRejectedValue(new Error("bug"));
    const throttle = { shouldReport } as unknown as SentryReportThrottle;

    new SentryService(throttle).captureException(keyed("k1"));
    await flush();

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
