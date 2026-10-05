import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { AdminTradeController } from "./admin-trade.controller";

/**
 * Platform takas iptali (önizleme + iptal) YALNIZ super_admin'indir: gerçek
 * para iadesi tetikler ve toplu iptal yoktur. Gerçek Reflector + RolesGuard ile
 * controller metadata'sı üzerinden sınanır — dekoratör sessizce değişirse kırılır.
 */
describe("Admin takas iptali — yetki", () => {
  const handlers = [
    ["cancelTrade", "POST", "/api/admin/trades/t1/cancel"],
    ["getTradeCancelPreview", "GET", "/api/admin/trades/t1/cancel-preview"],
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
      getHandler: () => AdminTradeController.prototype[handler],
      getClass: () => AdminTradeController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method,
          originalUrl: url,
        }),
      }),
    }) as unknown as ExecutionContext;

  it.each(handlers)("%s yalnız super_admin rolünü kabul eder", (handler) => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminTradeController.prototype[handler]),
    ).toEqual([AdminRole.super_admin]);
  });

  it.each(
    handlers.flatMap(([handler, method, url]) =>
      [AdminRole.admin, AdminRole.moderator].map(
        (role) => [handler, method, url, role] as const,
      ),
    ),
  )("%s: %s %s — %s reddedilir", async (handler, method, url, role) => {
    await expect(
      guard().canActivate(context(handler, method, url, role)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(handlers)("%s: super_admin geçer", async (handler, method, url) => {
    await expect(
      guard().canActivate(context(handler, method, url, AdminRole.super_admin)),
    ).resolves.toBe(true);
  });
});
