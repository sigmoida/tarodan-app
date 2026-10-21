import { ExecutionContext, HttpException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SignInMethodsController } from "../sign-in-methods/sign-in-methods.controller";
import { ReauthGuard } from "./reauth.guard";

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe("ReauthGuard", () => {
  const reauth = { isValidToken: jest.fn() };
  const guard = new ReauthGuard(reauth as never);

  beforeEach(() => jest.clearAllMocks());

  const refusal = async (request: Record<string, unknown>) => {
    try {
      await guard.canActivate(contextFor(request));
    } catch (error) {
      return error as HttpException;
    }
    throw new Error("expected the guard to refuse");
  };

  it("lets a live token of the session owner through", async () => {
    reauth.isValidToken.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        contextFor({ user: { id: "u1" }, body: { reauthToken: "t" } }),
      ),
    ).resolves.toBe(true);
    expect(reauth.isValidToken).toHaveBeenCalledWith("u1", "t");
  });

  it("answers 403 REAUTH_REQUIRED (never 401) for a refused token", async () => {
    reauth.isValidToken.mockResolvedValue(false);

    const error = await refusal({
      user: { id: "u1" },
      body: { reauthToken: "other-users-or-expired" },
    });

    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      i18nKey: "server.auth.reauthRequired",
      errorCode: "REAUTH_REQUIRED",
    });
  });

  it("answers 403 REAUTH_REQUIRED without a token or a body", async () => {
    reauth.isValidToken.mockResolvedValue(false);

    expect((await refusal({ user: { id: "u1" }, body: {} })).getStatus()).toBe(
      403,
    );
    expect((await refusal({ user: { id: "u1" } })).getStatus()).toBe(403);
  });

  it("refuses without a session user, without asking the store", async () => {
    const error = await refusal({ body: { reauthToken: "t" } });

    expect(error.getStatus()).toBe(403);
    expect(reauth.isValidToken).not.toHaveBeenCalled();
  });

  it("guards the set-password route", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SignInMethodsController.prototype.setPassword,
    );
    expect(guards).toContain(ReauthGuard);
  });
});
