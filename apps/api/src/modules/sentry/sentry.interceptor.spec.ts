import { CallHandler, ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of } from "rxjs";
import * as Sentry from "@sentry/node";
import { SentryInterceptor } from "./sentry.interceptor";

jest.mock("@sentry/node", () => ({
  setUser: jest.fn(),
  setContext: jest.fn(),
}));

/**
 * The request context attached to every Sentry event carries the body. It
 * uses the request-body rule: `beforeSend` runs only the generic pass, which
 * keeps `code` readable (error codes), so a body `code` (2FA, Google auth
 * code) is masked here or nowhere.
 */
describe("SentryInterceptor request context", () => {
  it("masks credentials and body codes in the request body", async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          url: "/api/auth/reauth",
          body: {
            provider: "google",
            code: "google-auth-code",
            password: "hunter2",
            reauthToken: "opaque-step-up-token",
            identityToken: "eyJ-apple-identity-token",
          },
          params: {},
          query: {},
          user: { id: "u1", email: "a@b.c" },
        }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(new SentryInterceptor().intercept(context, next));

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: "u1" });
    const [name, requestContext] = (Sentry.setContext as jest.Mock).mock
      .calls[0];
    expect(name).toBe("request");
    const stored = JSON.stringify(requestContext);
    for (const secret of [
      "google-auth-code",
      "hunter2",
      "opaque-step-up-token",
      "eyJ-apple-identity-token",
    ]) {
      expect(stored).not.toContain(secret);
    }
    expect(requestContext.body.provider).toBe("google");
  });
});
