import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { CsrfGuard } from "./csrf.guard";

describe("CsrfGuard", () => {
  const context = (
    method: string,
    cookie?: string,
    csrfHeader?: string,
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers: {
            ...(cookie ? { cookie } : {}),
            ...(csrfHeader ? { "x-csrf-token": csrfHeader } : {}),
          },
        }),
      }),
    }) as ExecutionContext;

  it("does not affect bearer-only native or BFF requests", () => {
    expect(new CsrfGuard().canActivate(context("POST"))).toBe(true);
  });

  it("accepts a matching double-submit token for cookie authentication", () => {
    expect(
      new CsrfGuard().canActivate(
        context(
          "PATCH",
          "access_token=jwt; csrf_token=csrf-value",
          "csrf-value",
        ),
      ),
    ).toBe(true);
  });

  it("rejects cookie-authenticated mutations without a matching token", () => {
    const guard = new CsrfGuard();

    expect(() =>
      guard.canActivate(context("DELETE", "admin_token=jwt")),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        context("POST", "refresh_token=jwt; csrf_token=expected", "different"),
      ),
    ).toThrow(ForbiddenException);
  });
});
