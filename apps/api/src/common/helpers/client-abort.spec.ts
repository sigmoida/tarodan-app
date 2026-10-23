import { Prisma } from "@prisma/client";
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
    // An upstream call failing after the client gave up is still ours.
    expect(isClientAbort(err({ code: "ECONNRESET" }), aborted)).toBe(false);
    expect(isClientAbort(err({ code: "ECONNABORTED" }), aborted)).toBe(false);
    expect(isClientAbort("Request aborted", aborted)).toBe(false);
    expect(isClientAbort(null, aborted)).toBe(false);
  });
  // The shapes our upstream clients really raise, on a request whose client
  // has already gone: each is an outage of ours and must stay reported.
  it.each([
    [
      "Prisma lost connection",
      new Prisma.PrismaClientKnownRequestError(
        "Server has closed the connection.",
        { code: "P1017", clientVersion: "test" },
      ),
    ],
    [
      "S3 (smithy) timeout",
      Object.assign(new Error("Connection timed out after 5000 ms"), {
        name: "TimeoutError",
        code: "ETIMEDOUT",
      }),
    ],
    [
      "Redis (ioredis) reset",
      Object.assign(new Error("read ECONNRESET"), {
        code: "ECONNRESET",
        errno: -54,
        syscall: "read",
      }),
    ],
    ["Redis (ioredis) closed", new Error("Connection is closed.")],
    [
      "SMTP (nodemailer) drop",
      Object.assign(new Error("Connection closed unexpectedly"), {
        code: "ECONNECTION",
        command: "CONN",
      }),
    ],
    [
      "http client (axios) timeout",
      Object.assign(new Error("timeout of 10000ms exceeded"), {
        code: "ECONNABORTED",
      }),
    ],
  ])("%s on an aborted request stays a server error", (_name, e) => {
    expect(isClientAbort(e, aborted)).toBe(false);
    expect(isClientAbort(e, legacyAborted)).toBe(false);
  });
});
