import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { RolesGuard, PERMISSION_MAP } from "../../auth/guards/roles.guard";
import { AdminTimingRulesController } from "./admin-timing-rules.controller";
import { AdminTimingRulesService } from "./admin-timing-rules.service";

describe("AdminTimingRulesService — zorunlu denetim, aynı işlemde", () => {
  const before = {
    id: "returnWindowDays" as const,
    value: 14,
    source: "default" as const,
    outOfBounds: false,
    action: "complete" as const,
    updatedAt: null,
  };
  const after = { ...before, value: 21, source: "setting" as const };
  /** Ayar yazımının işlem istemcisi — denetim de buna yazılmalı. */
  const TX = { tag: "settings-transaction" };

  const makeService = () => {
    const applied = [{ id: "returnWindowDays", before, after }];
    const timingRules = {
      // Gerçek servis gibi: yaz, sonra AYNI işlemde afterWrite'ı çağır;
      // afterWrite fırlatırsa işlem (ve yazım) geri alınır → hata yükselir.
      applyChanges: jest.fn(
        async (
          _changes: unknown,
          _actor: string,
          afterWrite?: (tx: unknown, applied: unknown[]) => Promise<void>,
        ) => {
          await afterWrite?.(TX, applied);
          return applied;
        },
      ),
      listStates: jest.fn().mockResolvedValue([after]),
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
      createAuditLog: jest.fn(),
    };
    return {
      service: new AdminTimingRulesService(timingRules as any, audit as any),
      timingRules,
      audit,
    };
  };

  it("her değişen kayıt için önce/sonra içeren ZORUNLU denetimi ayar işleminin içinde yazar", async () => {
    const { service, timingRules, audit } = makeService();

    const result = await service.update("user-1", [
      { id: "returnWindowDays", value: 21 },
    ]);

    expect(timingRules.applyChanges).toHaveBeenCalledWith(
      [{ id: "returnWindowDays", value: 21 }],
      "user-1",
      expect.any(Function),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "user-1",
      "timing_rule_update",
      "TimingRule",
      "returnWindowDays",
      before,
      after,
      TX,
    );
    // Best-effort yol KULLANILMAZ.
    expect(audit.createAuditLog).not.toHaveBeenCalled();
    expect(result).toEqual({ rules: [after] });
  });

  it("denetim yazılamazsa hata yükselir ve işlem (ayar yazımı dahil) geri alınır", async () => {
    const { service, audit } = makeService();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.update("user-1", [{ id: "returnWindowDays", value: 21 }]),
    ).rejects.toThrow("audit down");
  });

  it("doğrulama reddederse denetim yazılmaz", async () => {
    const { service, timingRules, audit } = makeService();
    timingRules.applyChanges.mockRejectedValue(new Error("invalid"));

    await expect(
      service.update("user-1", [{ id: "payoutGraceDays", value: 0 }]),
    ).rejects.toThrow("invalid");
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });
});

describe("AdminTimingRulesController — yetki", () => {
  const rolesOf = (method: keyof AdminTimingRulesController) =>
    Reflect.getMetadata(
      ROLES_KEY,
      AdminTimingRulesController.prototype[method],
    );

  it("değiştirme yalnız super_admin, okuma super_admin + admin", () => {
    expect(rolesOf("update")).toEqual([AdminRole.super_admin]);
    expect(rolesOf("list")).toEqual([AdminRole.super_admin, AdminRole.admin]);
  });

  it("segment izin matrisinde settings iznine bağlı", () => {
    expect(PERMISSION_MAP["timing-rules"]).toEqual(["settings"]);
  });

  const contextFor = (role: string, method: "PATCH" | "GET") =>
    ({
      getHandler: () =>
        method === "PATCH"
          ? AdminTimingRulesController.prototype.update
          : AdminTimingRulesController.prototype.list,
      getClass: () => AdminTimingRulesController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method,
          originalUrl: "/api/admin/timing-rules",
        }),
      }),
    }) as unknown as ExecutionContext;

  const guard = () =>
    new RolesGuard(new Reflector(), {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any);

  it.each([AdminRole.admin, AdminRole.moderator])(
    "%s PATCH isteğinde 403 alır",
    async (role) => {
      await expect(
        guard().canActivate(contextFor(role, "PATCH")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it("super_admin PATCH isteğinden geçer", async () => {
    await expect(
      guard().canActivate(contextFor(AdminRole.super_admin, "PATCH")),
    ).resolves.toBe(true);
  });
});
