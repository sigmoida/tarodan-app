import { describe, it, expect, vi } from "vitest";
import { createSentrySink } from "./sentry-sink";

function makeSentryLike() {
  return {
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    setUser: vi.fn(),
  };
}

describe("createSentrySink", () => {
  it("captureException forwards err and extra context", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    const err = new Error("boom");
    sink.captureException!(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledWith(err, {
      extra: { route: "/x" },
    });
  });

  it("addBreadcrumb maps level debug->debug, warn->warning", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    sink.addBreadcrumb!({
      category: "auth",
      message: "login",
      level: "warn",
      data: { a: 1 },
    });
    expect(s.addBreadcrumb).toHaveBeenCalledWith({
      category: "auth",
      message: "login",
      level: "warning",
      data: { a: 1 },
    });
  });

  it("setUser passes through (null included)", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    sink.setUser!(null);
    expect(s.setUser).toHaveBeenCalledWith(null);
  });

  it("log() is a no-op", () => {
    const s = makeSentryLike();
    const sink = createSentrySink(s);
    expect(() =>
      sink.log({ level: "info", message: "x", name: "t", timestamp: 0 }),
    ).not.toThrow();
    expect(s.captureException).not.toHaveBeenCalled();
  });
});
