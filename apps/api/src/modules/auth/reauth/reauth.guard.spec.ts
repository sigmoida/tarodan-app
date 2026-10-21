import { ExecutionContext, HttpException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { REAUTH_TOKEN_HEADER } from "@tarodan/types";
import { UserController } from "../../user/user.controller";
import { AuthController } from "../auth.controller";
import { SignInMethodsController } from "../sign-in-methods/sign-in-methods.controller";
import { REAUTH_POLICY_METADATA, type ReauthPolicy } from "./reauth-policy";
import { ReauthGuard } from "./reauth.guard";
import { RequireReauth } from "./require-reauth.decorator";

/** Handlers that carry the two policies, plus one with the bare guard. */
class Routes {
  @RequireReauth()
  always() {
    // a route stub: only its metadata matters
  }

  @RequireReauth({ required: "setting", flow: "account_delete" })
  bySetting() {
    // a route stub: only its metadata matters
  }

  bareGuard() {
    // a route stub without a policy
  }
}

type Handler = keyof Routes;

const contextFor = (
  request: Record<string, unknown>,
  handler: Handler = "always",
): ExecutionContext =>
  ({
    getHandler: () => Routes.prototype[handler],
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

/** A signed-in request; `headers` are lower case, as Node reports them. */
const signedIn = (
  parts: { body?: unknown; headers?: Record<string, unknown> } = {},
) => ({ user: { id: "u1" }, headers: {}, ...parts });

describe("ReauthGuard", () => {
  const reauth = {
    isValidToken: jest.fn(),
    isRequiredForSensitiveActions: jest.fn(),
  };
  const sentry = { setTag: jest.fn() };
  const guard = new ReauthGuard(
    reauth as never,
    new Reflector(),
    sentry as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    reauth.isValidToken.mockResolvedValue(false);
    reauth.isRequiredForSensitiveActions.mockResolvedValue(false);
  });

  const refusal = async (
    request: Record<string, unknown>,
    handler: Handler = "always",
  ) => {
    try {
      await guard.canActivate(contextFor(request, handler));
    } catch (error) {
      return error as HttpException;
    }
    throw new Error("expected the guard to refuse");
  };

  /** Every step-up refusal is this answer: 403, never 401. */
  const expectReauthRequired = (error: HttpException) => {
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      i18nKey: "server.auth.reauthRequired",
      errorCode: "REAUTH_REQUIRED",
    });
  };

  describe('required: "always" (sign-in method writes)', () => {
    it("lets a live token of the session owner through", async () => {
      reauth.isValidToken.mockResolvedValue(true);

      await expect(
        guard.canActivate(contextFor(signedIn({ body: { reauthToken: "t" } }))),
      ).resolves.toBe(true);
      expect(reauth.isValidToken).toHaveBeenCalledWith("u1", "t");
    });

    it("answers 403 REAUTH_REQUIRED (never 401) for a refused token", async () => {
      expectReauthRequired(
        await refusal(
          signedIn({ body: { reauthToken: "other-users-or-expired" } }),
        ),
      );
    });

    it("answers 403 REAUTH_REQUIRED without a token or a body, whatever the setting", async () => {
      expectReauthRequired(await refusal(signedIn({ body: {} })));
      expectReauthRequired(await refusal(signedIn()));
      expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
    });

    it("treats a route with the bare guard (no policy) as always required", async () => {
      expectReauthRequired(await refusal(signedIn(), "bareGuard"));
      expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
    });
  });

  describe("where the token is read: body first, then the header", () => {
    it("pins the header name the gateway forwards", () => {
      expect(REAUTH_TOKEN_HEADER).toBe("x-reauth-token");
    });

    it("reads the X-Reauth-Token header when there is no body (DELETE)", async () => {
      reauth.isValidToken.mockResolvedValue(true);

      await expect(
        guard.canActivate(
          contextFor(
            signedIn({ headers: { [REAUTH_TOKEN_HEADER]: "from-header" } }),
          ),
        ),
      ).resolves.toBe(true);
      expect(reauth.isValidToken).toHaveBeenCalledWith("u1", "from-header");
    });

    it("reads the header when the body has no reauthToken", async () => {
      reauth.isValidToken.mockResolvedValue(true);

      await guard.canActivate(
        contextFor(
          signedIn({
            body: { newEmail: "new@example.com" },
            headers: { [REAUTH_TOKEN_HEADER]: "from-header" },
          }),
        ),
      );
      expect(reauth.isValidToken).toHaveBeenCalledWith("u1", "from-header");
    });

    it("uses the body token when both are sent, and never falls back to the header", async () => {
      reauth.isValidToken.mockImplementation(
        async (_user: string, token: unknown) => token === "from-header",
      );

      expectReauthRequired(
        await refusal(
          signedIn({
            body: { reauthToken: "from-body" },
            headers: { [REAUTH_TOKEN_HEADER]: "from-header" },
          }),
        ),
      );
      expect(reauth.isValidToken).toHaveBeenCalledTimes(1);
      expect(reauth.isValidToken).toHaveBeenCalledWith("u1", "from-body");
    });

    it("counts an empty or null token as sent, so it is checked, not skipped", async () => {
      for (const request of [
        signedIn({ body: { reauthToken: null } }),
        signedIn({ body: { reauthToken: "" } }),
        signedIn({ headers: { [REAUTH_TOKEN_HEADER]: "" } }),
      ]) {
        expectReauthRequired(await refusal(request, "bySetting"));
      }
      expect(reauth.isValidToken).toHaveBeenCalledTimes(3);
      expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
    });

    it("refuses a repeated header (an array is not a token)", async () => {
      reauth.isValidToken.mockImplementation(
        async (_user: string, token: unknown) => typeof token === "string",
      );

      expectReauthRequired(
        await refusal(
          signedIn({ headers: { [REAUTH_TOKEN_HEADER]: ["a", "b"] } }),
          "bySetting",
        ),
      );
    });
  });

  describe('required: "setting" (account deletion, e-mail change)', () => {
    it("lets a request without a token through while the setting is off (mobile 1.0.5)", async () => {
      await expect(
        guard.canActivate(contextFor(signedIn(), "bySetting")),
      ).resolves.toBe(true);
      expect(reauth.isRequiredForSensitiveActions).toHaveBeenCalledTimes(1);
      expect(reauth.isValidToken).not.toHaveBeenCalled();
    });

    it("refuses a request without a token while the setting is on", async () => {
      reauth.isRequiredForSensitiveActions.mockResolvedValue(true);

      expectReauthRequired(await refusal(signedIn(), "bySetting"));
    });

    it("checks a token that is sent even while the setting is off", async () => {
      expectReauthRequired(
        await refusal(
          signedIn({
            headers: { [REAUTH_TOKEN_HEADER]: "expired-or-foreign" },
          }),
          "bySetting",
        ),
      );
      expect(reauth.isValidToken).toHaveBeenCalledWith(
        "u1",
        "expired-or-foreign",
      );
      expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
    });

    it("lets a live token through without reading the setting", async () => {
      reauth.isValidToken.mockResolvedValue(true);

      await expect(
        guard.canActivate(
          contextFor(
            signedIn({ headers: { [REAUTH_TOKEN_HEADER]: "live" } }),
            "bySetting",
          ),
        ),
      ).resolves.toBe(true);
      expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
    });

    it("fails the request when the setting cannot be read (never lets it through)", async () => {
      reauth.isRequiredForSensitiveActions.mockRejectedValue(
        new Error("db down"),
      );

      await expect(
        guard.canActivate(contextFor(signedIn(), "bySetting")),
      ).rejects.toThrow("db down");
    });

    it("tags the flow in Sentry, also when it refuses", async () => {
      reauth.isRequiredForSensitiveActions.mockResolvedValue(true);

      await refusal(signedIn(), "bySetting");

      expect(sentry.setTag).toHaveBeenCalledWith("auth.flow", "account_delete");
    });

    it("tags the flow before every other refusal too: a foreign token, no session, a failed setting read", async () => {
      expectReauthRequired(
        await refusal(
          signedIn({ headers: { [REAUTH_TOKEN_HEADER]: "foreign" } }),
          "bySetting",
        ),
      );
      expectReauthRequired(await refusal({ headers: {} }, "bySetting"));
      reauth.isRequiredForSensitiveActions.mockRejectedValue(
        new Error("db down"),
      );
      await expect(
        guard.canActivate(contextFor(signedIn(), "bySetting")),
      ).rejects.toThrow("db down");

      expect(sentry.setTag).toHaveBeenCalledTimes(3);
      for (const call of sentry.setTag.mock.calls) {
        expect(call).toEqual(["auth.flow", "account_delete"]);
      }
    });

    it("sets no flow tag on a route whose policy names none", async () => {
      reauth.isValidToken.mockResolvedValue(true);

      await guard.canActivate(
        contextFor(signedIn({ body: { reauthToken: "t" } }), "always"),
      );
      expect(sentry.setTag).not.toHaveBeenCalled();
    });
  });

  it("refuses without a session user, without asking the store or the setting", async () => {
    for (const handler of ["always", "bySetting"] as const) {
      expectReauthRequired(
        await refusal({ body: { reauthToken: "t" }, headers: {} }, handler),
      );
      expectReauthRequired(await refusal({ headers: {} }, handler));
    }
    expect(reauth.isValidToken).not.toHaveBeenCalled();
    expect(reauth.isRequiredForSensitiveActions).not.toHaveBeenCalled();
  });

  describe("guarded routes", () => {
    const policyOf = (handler: object): ReauthPolicy | undefined =>
      Reflect.getMetadata(REAUTH_POLICY_METADATA, handler);
    const guardsOf = (handler: object): unknown[] =>
      Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

    it.each([
      {
        route: "POST /auth/password/set",
        handler: SignInMethodsController.prototype.setPassword,
        policy: { required: "always" },
      },
      {
        route: "DELETE /users/me",
        handler: UserController.prototype.deleteAccount,
        policy: { required: "setting", flow: "account_delete" },
      },
      {
        route: "POST /auth/email/request-change",
        handler: AuthController.prototype.requestEmailChange,
        policy: { required: "setting", flow: "email_change" },
      },
    ])("$route carries the guard and its policy", ({ handler, policy }) => {
      expect(guardsOf(handler)).toContain(ReauthGuard);
      expect(policyOf(handler)).toEqual(policy);
    });

    it("leaves the e-mail change verification step unguarded (the code is the proof)", () => {
      expect(
        guardsOf(AuthController.prototype.verifyEmailChange),
      ).not.toContain(ReauthGuard);
    });
  });
});
