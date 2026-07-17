import { describe, it, expect, vi } from "vitest";
import { createLogger } from "./logger";
import type { Sink } from "./types";

function makeSpySink(): Sink & { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn(),
    captureException: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
  } as unknown as Sink & { log: ReturnType<typeof vi.fn> };
}

describe("createLogger", () => {
  it("fans out log() to all sinks", () => {
    const a = makeSpySink();
    const b = makeSpySink();
    const log = createLogger({ name: "test", sinks: [a, b] });
    log.info("hello", { x: 1 });
    expect(a.log).toHaveBeenCalledTimes(1);
    expect(b.log).toHaveBeenCalledTimes(1);
    const entry = a.log.mock.calls[0][0];
    expect(entry).toMatchObject({
      level: "info",
      message: "hello",
      name: "test",
      context: { x: 1 },
    });
    expect(typeof entry.timestamp).toBe("number");
  });

  it("respects minLevel filtering", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s], minLevel: "warn" });
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
    expect(s.log).toHaveBeenCalledTimes(2);
  });

  it("routes error level to sink.captureException when error is present", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    const err = new Error("boom");
    log.error("failed", { error: err, route: "/x" });
    expect(s.captureException).toHaveBeenCalledTimes(1);
    expect(s.captureException).toHaveBeenCalledWith(err, {
      error: err,
      route: "/x",
    });
  });

  it("error without an error value does NOT call captureException", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.error("plain error message");
    expect(s.captureException).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
  });

  it("captureException forwards to sink and also logs error entry", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    const err = new Error("boom");
    log.captureException(err, { route: "/x" });
    expect(s.captureException).toHaveBeenCalledTimes(1);
    expect(s.captureException).toHaveBeenCalledWith(err, { route: "/x" });
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log.mock.calls[0][0]).toMatchObject({ level: "error" });
  });

  it("debug/info/warn produce breadcrumbs on the sink", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.info("crumb", { a: 1 });
    expect(s.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "crumb",
        level: "info",
        category: "t",
        data: { a: 1 },
      }),
    );
  });

  it("setUser and setContext propagate to sinks", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "t", sinks: [s] });
    log.setUser({ id: "u1" });
    expect(s.setUser).toHaveBeenCalledWith({ id: "u1" });
  });

  it("child inherits sinks and merges name", () => {
    const s = makeSpySink();
    const log = createLogger({ name: "root", sinks: [s] });
    const c = log.child("sub");
    c.info("hi");
    expect(s.log.mock.calls[0][0].name).toBe("root:sub");
  });
});
