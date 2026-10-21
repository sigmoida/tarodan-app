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

  const run = async (method: string, body: unknown) => {
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
          headers: { "user-agent": "jest" },
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

  it("stores no body for a GET", async () => {
    const metadata = await run("GET", { password: "hunter2" });
    expect(metadata.body).toBeUndefined();
  });
});
