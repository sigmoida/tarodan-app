import { createSentryServiceSink } from "./sentry-service-sink";

describe("createSentryServiceSink", () => {
  const makeSentry = () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    clearUser: jest.fn(),
    addBreadcrumb: jest.fn(),
  });

  it("captureException forwards Error to SentryService", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    const err = new Error("boom");
    sink.captureException!(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledWith(err, { route: "/x" });
  });

  it("wraps non-Error values before forwarding", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.captureException!("stringy", {});
    expect(s.captureException).toHaveBeenCalledWith(expect.any(Error), {});
  });

  it("setUser(null) calls clearUser", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.setUser!(null);
    expect(s.clearUser).toHaveBeenCalled();
  });

  it("addBreadcrumb maps to Sentry breadcrumb shape", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    sink.addBreadcrumb!({ category: "auth", message: "login", level: "info" });
    expect(s.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        message: "login",
        level: "info",
      }),
    );
  });

  it("log() is a no-op (console handled by ConsoleSink)", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    expect(() =>
      sink.log({ level: "info", message: "x", name: "t", timestamp: 0 }),
    ).not.toThrow();
  });

  it("redacts cardholder data before forwarding exception context", () => {
    const s = makeSentry();
    const sink = createSentryServiceSink(s as any);
    const pan = "4355084355084358";
    const cvv = "123";

    sink.captureException!(new Error("payment failed"), {
      request: {
        body: {
          card: {
            cardNumber: pan,
            cvv,
          },
        },
      },
    });

    const forwarded = JSON.stringify(s.captureException.mock.calls);
    expect(forwarded).not.toContain(pan);
    expect(forwarded).not.toContain(cvv);
    expect(forwarded).toContain("[REDACTED]");
  });
});
