import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { AdminAdPackageController } from "../admin-ad-package.controller";

/**
 * Grant, revoke and refund and stop move money or give away paid placement:
 * `super_admin` and `admin` only, never `moderator`, plus the `ads`
 * permission of the `/admin/ad-packages` segment (the boost purchases
 * screen). Real Reflector + RolesGuard on the controller's metadata, so a
 * silently changed decorator fails here.
 */
describe("Admin boost operations: access", () => {
  const routes = [
    ["grantBoost", "/api/admin/ad-packages/purchases/grant"],
    ["refundBoost", "/api/admin/ad-packages/purchases/b1/refund"],
    ["revokeBoost", "/api/admin/ad-packages/purchases/b1/revoke"],
  ] as const;

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

  const context = (
    handler: (typeof routes)[number][0],
    url: string,
    role: AdminRole,
  ): ExecutionContext =>
    ({
      getHandler: () => AdminAdPackageController.prototype[handler],
      getClass: () => AdminAdPackageController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method: "POST",
          originalUrl: url,
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each(routes)("%s accepts super_admin and admin only", (handler) => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AdminAdPackageController.prototype[handler],
      ),
    ).toEqual([AdminRole.super_admin, AdminRole.admin]);
  });

  it.each(routes)("%s: a moderator gets 403", async (handler, url) => {
    await expect(
      guard().canActivate(context(handler, url, AdminRole.moderator)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(routes)(
    "%s: an admin with the ads permission passes",
    async (handler, url) => {
      await expect(
        guard().canActivate(context(handler, url, AdminRole.admin)),
      ).resolves.toBe(true);
    },
  );

  it.each(routes)(
    "%s: an admin whose role lost the ads permission gets 403",
    async (handler, url) => {
      await expect(
        guard({ admin: ["payments"] }).canActivate(
          context(handler, url, AdminRole.admin),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
});
