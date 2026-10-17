import { AppNestLogger } from "./nest-logger";
import { readFingerprint } from "./error-fingerprint";
import { getAppLogger } from "./logger";

jest.mock("./logger", () => ({ getAppLogger: jest.fn() }));

describe("AppNestLogger", () => {
  const child = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const root = { child: jest.fn(() => child) };

  beforeEach(() => {
    jest.clearAllMocks();
    (getAppLogger as jest.Mock).mockReturnValue(root);
    delete process.env.NEST_VERBOSE_ROUTES;
  });

  it("preserves Nest context on structured info logs", () => {
    new AppNestLogger().log("started", "OrdersService");

    expect(root.child).toHaveBeenCalledWith("OrdersService");
    expect(child.info).toHaveBeenCalledWith("started", undefined);
  });

  it("captures error calls with their stack and context", () => {
    const stack = "Error: failed\n    at handler (/app/main.js:1:1)";
    new AppNestLogger().error("failed", stack, "PaymentsService");

    expect(root.child).toHaveBeenCalledWith("PaymentsService");
    expect(child.error).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({
        error: expect.objectContaining({ stack }),
        details: [stack],
      }),
    );
  });

  it("keeps noisy route discovery logs disabled by default", () => {
    new AppNestLogger().log("Mapped route", "RouterExplorer");

    expect(root.child).not.toHaveBeenCalled();
  });

  it("attaches a context+message fingerprint to a logger-created error", () => {
    new AppNestLogger().error(
      "ELOGO_INVOICE_EXHAUSTED id=3fa85f64-5717-4562-b3fc-2c963f66afa6 no=TRD10023",
      "ElogoInvoicingService",
    );

    const [, ctx] = child.error.mock.calls[0];
    expect(readFingerprint(ctx.error)).toEqual([
      "ElogoInvoicingService",
      "ELOGO_INVOICE_EXHAUSTED id=<uuid> no=<code>",
    ]);
  });

  it("gives two ELOGO_INVOICE_EXHAUSTED errors with different ids the same fingerprint", () => {
    new AppNestLogger().error(
      "ELOGO_INVOICE_EXHAUSTED id=3fa85f64-5717-4562-b3fc-2c963f66afa6 no=TRD10023",
      "ElogoInvoicingService",
    );
    new AppNestLogger().error(
      "ELOGO_INVOICE_EXHAUSTED id=9c858901-8a57-4791-81fe-4c455b099bc9 no=TRD98877",
      "ElogoInvoicingService",
    );

    const [firstCall, secondCall] = child.error.mock.calls;
    expect(readFingerprint(firstCall[1].error)).toEqual(
      readFingerprint(secondCall[1].error),
    );
  });

  it("includes the supplied error's name in the fingerprint when a real Error is passed", () => {
    class CustomError extends Error {
      override name = "CustomError";
    }
    new AppNestLogger().error(
      new CustomError("boom"),
      undefined,
      "PaymentsService",
    );

    const [, ctx] = child.error.mock.calls[0];
    expect(readFingerprint(ctx.error)).toEqual([
      "PaymentsService",
      "CustomError",
      "boom",
    ]);
  });
});
