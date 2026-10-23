import { isClientAbort } from "./client-abort";

describe("isClientAbort", () => {
  const err = (props: Record<string, unknown>, message = "aborted") =>
    Object.assign(new Error(message), props);
  const aborted = { readableAborted: true };
  const legacyAborted = { aborted: true };
  // A request whose body was read in full and whose client is still there.
  const live = { readableAborted: false, aborted: false };

  it.each([
    ["multer", err({}, "Request aborted")],
    ["raw-body", err({ type: "request.aborted", code: "ECONNABORTED" })],
    ["request stream reset", err({ code: "ECONNRESET" })],
  ])("%s on an aborted request is a client abort", (_name, e) => {
    expect(isClientAbort(e, aborted)).toBe(true);
    expect(isClientAbort(e, legacyAborted)).toBe(true);
  });

  it.each([
    ["S3 socket hang up", err({ code: "ECONNRESET" }, "socket hang up")],
    ["upstream timeout", err({ code: "ECONNABORTED" }, "timeout exceeded")],
    ["lookalike message", err({}, "Request aborted")],
  ])(
    "%s while the client is still connected stays a server error",
    (_name, e) => {
      expect(isClientAbort(e, live)).toBe(false);
      expect(isClientAbort(e, undefined)).toBe(false);
    },
  );

  it("an unrelated error on an aborted request is not swallowed", () => {
    expect(isClientAbort(new Error("db down"), aborted)).toBe(false);
    expect(isClientAbort("Request aborted", aborted)).toBe(false);
    expect(isClientAbort(null, aborted)).toBe(false);
  });
});
