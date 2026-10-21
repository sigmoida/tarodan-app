import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { ALL_PERMISSIONS_KEY } from "../../../auth/decorators/require-permission.decorator";
import { AdminAdPackageController } from "../admin-ad-package.controller";

/**
 * Grant, revoke and refund and stop move money or give away paid placement:
 * `super_admin` and `admin` only, never `moderator`. Grant and revoke need
 * the `ads` permission of the `/admin/ad-packages` segment (the boost
 * purchases screen); the refund sends money back, so it needs `ads` and
 * `payments` both. Real Reflector + RolesGuard on the controller's metadata,
 * so a silently changed decorator fails here.
 */
describe("Admin boost operations: access", () => {
  const routes = {
    grantBoost: "/api/admin/ad-packages/purchases/grant",
    refundBoost: "/api/admin/ad-packages/purchases/b1/refund",
    revokeBoost: "/api/admin/ad-packages/purchases/b1/revoke",
  } as const;
  type Handler = keyof typeof routes;
  const all = Object.keys(routes) as Handler[];
  const adsOnly = all.filter((handler) => handler !== "refundBoost");

  const guard = (permissions?: Record<string, string[]>) =>
    new RolesGuard(new Reflector(), {
      platformSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            permissions ? { settingValue: JSON.stringify(permissions) } : null,
          ),
      },
    } as never);

  const context = (handler: Handler, role: AdminRole): ExecutionContext =>
    ({
      getHandler: () => AdminAdPackageController.prototype[handler],
      getClass: () => AdminAdPackageController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method: "POST",
          originalUrl: routes[handler],
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each(all)("%s accepts super_admin and admin only", (handler) => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminAdPackageController.prototype[handler],
      ),
    ).toEqual([AdminRole.super_admin, AdminRole.admin]);
  });

  it("only the refund declares the all-of permission rule", () => {
    const declared = (handler: Handler) =>
      Reflect.getMetadata(
        ALL_PERMISSIONS_KEY,
        AdminAdPackageController.prototype[handler],
      );
    expect(declared("refundBoost")).toEqual(["ads", "payments"]);
    expect(declared("grantBoost")).toBeUndefined();
    expect(declared("revokeBoost")).toBeUndefined();
  });

  it.each(all)("%s: a moderator gets 403", async (handler) => {
    await expect(
      guard().canActivate(context(handler, AdminRole.moderator)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(all)(
    "%s: an admin with the default permissions passes",
    async (handler) => {
      await expect(
        guard().canActivate(context(handler, AdminRole.admin)),
      ).resolves.toBe(true);
    },
  );

  it.each(all)(
    "%s: a super_admin passes even with no permissions stored",
    async (handler) => {
      await expect(
        guard({ super_admin: [] }).canActivate(
          context(handler, AdminRole.super_admin),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(adsOnly)(
    "%s: an admin with only the ads permission passes",
    async (handler) => {
      await expect(
        guard({ admin: ["ads"] }).canActivate(
          context(handler, AdminRole.admin),
        ),
      ).resolves.toBe(true);
    },
  );

  it.each(all)(
    "%s: an admin whose role lost the ads permission gets 403",
    async (handler) => {
      await expect(
        guard({ admin: ["payments"] }).canActivate(
          context(handler, AdminRole.admin),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  describe("refundBoost needs ads and payments", () => {
    it("ads only: 403 naming the missing payments permission", async () => {
      await expect(
        guard({ admin: ["ads"] }).canActivate(
          context("refundBoost", AdminRole.admin),
        ),
      ).rejects.toMatchObject({
        status: 403,
        response: {
          i18nKey: "server.auth.permissionRequired",
          i18nParams: { perms: "payments" },
        },
      });
    });

    it("payments only: 403", async () => {
      await expect(
        guard({ admin: ["payments"] }).canActivate(
          context("refundBoost", AdminRole.admin),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("neither: 403", async () => {
      await expect(
        guard({ admin: ["dashboard"] }).canActivate(
          context("refundBoost", AdminRole.admin),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("both: allowed", async () => {
      await expect(
        guard({ admin: ["ads", "payments"] }).canActivate(
          context("refundBoost", AdminRole.admin),
        ),
      ).resolves.toBe(true);
    });

    it("a moderator granted both still gets 403 (role first)", async () => {
      await expect(
        guard({ moderator: ["ads", "payments"] }).canActivate(
          context("refundBoost", AdminRole.moderator),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
