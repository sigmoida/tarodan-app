import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { AdminProductController } from "./admin-product.controller";

/**
 * Süresi dolmuş ilanı (tekil + toplu) yeniden yayına alma moderatöre kapalıdır:
 * yönetici kararı onay sayılır. Gerçek Reflector + RolesGuard ile controller
 * metadata'sı üzerinden sınanır — dekoratör sessizce değişirse kırılır.
 */
describe("Admin ilan yenileme — yetki", () => {
  const handlers = [
    ["renewExpiredListing", "POST", "/api/admin/products/p1/renew"],
    ["bulkRenewExpiredListings", "POST", "/api/admin/products/bulk-renew"],
  ] as const;

  const guard = () =>
    new RolesGuard(new Reflector(), {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);

  const context = (
    handler: (typeof handlers)[number][0],
    method: string,
    url: string,
    role: AdminRole,
  ): ExecutionContext =>
    ({
      getHandler: () => AdminProductController.prototype[handler],
      getClass: () => AdminProductController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method,
          originalUrl: url,
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each(handlers)("%s yalnız super_admin ve admin kabul eder", (handler) => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminProductController.prototype[handler]),
    ).toEqual([AdminRole.super_admin, AdminRole.admin]);
  });

  it.each(handlers)(
    "%s: moderatör reddedilir",
    async (handler, method, url) => {
      await expect(
        guard().canActivate(context(handler, method, url, AdminRole.moderator)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(
    handlers.flatMap(([handler, method, url]) =>
      [AdminRole.super_admin, AdminRole.admin].map(
        (role) => [handler, method, url, role] as const,
      ),
    ),
  )("%s: %s %s — %s geçer", async (handler, method, url, role) => {
    await expect(
      guard().canActivate(context(handler, method, url, role)),
    ).resolves.toBe(true);
  });
});
