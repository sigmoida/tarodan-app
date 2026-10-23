import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { lastValueFrom, throwError } from "rxjs";
import { ErrorLogInterceptor } from "./error-log.interceptor";

/**
 * A failed request is written to `error_logs` with its body. Credentials in
 * that body (passwords, the step-up token, provider tokens, body `code`s) must
 * never be stored as values; the e2e OPS-053 covers only the password.
 */
describe("ErrorLogInterceptor body redaction", () => {
  const SECRETS = {
    password: "hunter2",
    newPassword: "Fresh-Pass-1",
    reauthToken: "opaque-step-up-token",
    idToken: "eyJ-google-id-token",
    identityToken: "eyJ-apple-identity-token",
    authorizationCode: "apple-authorization-code",
    code: "google-auth-code",
  };

  /** The whole `error_logs` row of the last `run`. */
  let lastRow: unknown;

  const run = async (
    method: string,
    body: unknown,
    headers: Record<string, string> = { "user-agent": "jest" },
  ) => {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new ErrorLogInterceptor({
      errorLog: { create },
    } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url: "/api/auth/reauth",
          body,
          user: { id: "u1" },
          headers,
          ip: "127.0.0.1",
        }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () => throwError(() => new ForbiddenException()),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The row is written without blocking the error response.
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    lastRow = create.mock.calls[0][0].data;
    return create.mock.calls[0][0].data.metadata as { body?: unknown };
  };

  it("stores the body with every credential masked and the rest readable", async () => {
    const metadata = await run("POST", { ...SECRETS, provider: "google" });

    const stored = JSON.stringify(metadata.body);
    for (const secret of Object.values(SECRETS)) {
      expect(stored).not.toContain(secret);
    }
    expect(metadata.body).toMatchObject({
      provider: "google",
      password: "[REDACTED]",
      reauthToken: "[REDACTED]",
      code: "[REDACTED]",
    });
  });

  it("masks credentials nested in the body and keyed in another case", async () => {
    const metadata = await run("POST", {
      data: { NEW_PASSWORD: "Fresh-Pass-1", "reauth-token": "opaque" },
    });

    const stored = JSON.stringify(metadata.body);
    expect(stored).not.toContain("Fresh-Pass-1");
    expect(stored).not.toContain("opaque");
  });

  // A step-up refusal is a 403, so every refused `DELETE /users/me` writes a
  // row; the token there travels in the X-Reauth-Token header (T8b).
  it("never stores the X-Reauth-Token header", async () => {
    await run(
      "DELETE",
      {},
      { "user-agent": "jest", "x-reauth-token": "opaque-header-token" },
    );

    expect(JSON.stringify(lastRow)).not.toContain("opaque-header-token");
  });

  it("stores no body for a GET", async () => {
    const metadata = await run("GET", { password: "hunter2" });
    expect(metadata.body).toBeUndefined();
  });
});

describe("ErrorLogInterceptor client aborts", () => {
  const persist = async (error: Error, request: Record<string, unknown>) => {
    const create = jest.fn().mockResolvedValue({});
    const interceptor = new ErrorLogInterceptor({
      errorLog: { create },
    } as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          url: "/api/media/upload/product",
          headers: {},
          ...request,
        }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => throwError(() => error) };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(error);
    await new Promise((resolve) => setImmediate(resolve));
    return create;
  };

  it("does not store an upload the client aborted", async () => {
    const create = await persist(new Error("Request aborted"), {
      readableAborted: true,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("still stores an upstream reset while the client is connected", async () => {
    const reset = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const create = await persist(reset, { readableAborted: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.severity).toBe("error");
  });
});
