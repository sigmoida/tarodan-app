import * as Sentry from "@sentry/node";
import { SentryService } from "./sentry.service";
import { attachFingerprint } from "../../common/logging/error-fingerprint";

jest.mock("@sentry/node", () => ({
  withScope: jest.fn((cb: (scope: unknown) => void) =>
    cb({
      setExtra: jest.fn(),
      setFingerprint: jest.fn(),
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
