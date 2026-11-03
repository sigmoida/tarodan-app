import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_MAP, RolesGuard } from "../../auth/guards/roles.guard";
import { AdminInstallmentsController } from "./admin-installments.controller";

/**
 * Finance > Installments authorization (ADR 0019, plan 4.6.6): reads for
 * super_admin and admin, every write super_admin only (money
 * configuration); a moderator gets nothing. Checked through the real
 * RolesGuard against the controller's own @Roles metadata.
 */
describe("AdminInstallmentsController authorization", () => {
  const guard = new RolesGuard(new Reflector(), {
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  } as never);

  const ctx = (
    method: keyof AdminInstallmentsController,
    role: string,
    http: string,
    url: string,
  ): ExecutionContext =>
    ({
      getHandler: () => AdminInstallmentsController.prototype[method],
      getClass: () => AdminInstallmentsController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method: http,
          originalUrl: url,
        }),
      }),
    }) as unknown as ExecutionContext;

  const reads: Array<[keyof AdminInstallmentsController, string]> = [
    ["getSettings", "/api/admin/installments/settings"],
    ["listRules", "/api/admin/installments/rules"],
    [
      "preview",
      "/api/admin/installments/preview?segment=free&amount=1000&family=world",
    ],
  ];
  const writes: Array<[keyof AdminInstallmentsController, string, string]> = [
    ["updateSettings", "PATCH", "/api/admin/installments/settings"],
    ["createRule", "POST", "/api/admin/installments/rules"],
    [
      "createRuleVersion",
      "POST",
      "/api/admin/installments/rules/0b6f/versions",
    ],
    ["archiveRule", "POST", "/api/admin/installments/rules/0b6f/archive"],
  ];

  it("maps the segment to the finance (payments) permission", () => {
    expect(PERMISSION_MAP.installments).toEqual(["payments"]);
  });

  it.each(reads)(
    "lets super_admin and admin read (%s)",
    async (method, url) => {
      for (const role of ["super_admin", "admin"]) {
        await expect(
          guard.canActivate(ctx(method, role, "GET", url)),
        ).resolves.toBe(true);
      }
    },
  );

  it.each(reads)("refuses a moderator a read (%s)", async (method, url) => {
    await expect(
      guard.canActivate(ctx(method, "moderator", "GET", url)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each(writes)(
    "lets only super_admin write (%s)",
    async (method, http, url) => {
      await expect(
        guard.canActivate(ctx(method, "super_admin", http, url)),
      ).resolves.toBe(true);
      for (const role of ["admin", "moderator"]) {
        await expect(
          guard.canActivate(ctx(method, role, http, url)),
        ).rejects.toMatchObject({
          status: 403,
          response: { i18nKey: "server.auth.roleRequired" },
        });
      }
    },
  );
});
