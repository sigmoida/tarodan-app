import { AppNestLogger } from "./nest-logger";
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
});
