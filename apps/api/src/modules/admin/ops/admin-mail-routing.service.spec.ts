import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { ROLES_KEY } from "../../auth/decorators/roles.decorator";
import { RolesGuard, PERMISSION_MAP } from "../../auth/guards/roles.guard";
import { AdminMailRoutingController } from "./admin-mail-routing.controller";
import { AdminMailRoutingService } from "./admin-mail-routing.service";

const PLAIN = "mailbox-Pa55";

type AfterWrite = (tx: unknown, change: unknown) => Promise<void>;

describe("AdminMailRoutingService — zorunlu denetim, şifresiz", () => {
  const TX = { tag: "tx" };
  const view = {
    id: "acc-1",
    address: "siparis@tarodan.com.tr",
    displayName: "Tarodan Sipariş",
    host: null,
    port: null,
    secure: null,
    username: "siparis@tarodan.com.tr",
    hasPassword: true,
    lastTestAt: null,
    lastTestOk: null,
    lastTestError: null,
    usedByAreas: [],
  };

  const build = () => {
    // Domain servisleri gerçekleri gibi: yaz, sonra AYNI işlemde afterWrite.
    const accounts = {
      create: jest.fn(
        async (_input: unknown, _actor: string, after?: AfterWrite) => {
          await after?.(TX, { before: null, after: view });
          return view;
        },
      ),
      update: jest.fn(
        async (
          _id: string,
          _patch: unknown,
          _actor: string,
          after?: AfterWrite,
        ) => {
          await after?.(TX, {
            before: view,
            after: { ...view, displayName: "Yeni" },
          });
          return view;
        },
      ),
      remove: jest.fn(async (_id: string, after?: AfterWrite) => {
        await after?.(TX, { before: view, after: null });
      }),
      test: jest.fn().mockResolvedValue({ ok: false, error: "Invalid login" }),
    };
    const routing = {
      getState: jest.fn(),
      updateArea: jest.fn(
        async (_area: string, _u: unknown, _a: string, after?: AfterWrite) => {
          await after?.(TX, {
            before: { id: "order" },
            after: { id: "order" },
          });
          return { id: "order" };
        },
      ),
    };
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue({}),
      createAuditLog: jest.fn().mockResolvedValue({}),
    };
    return {
      service: new AdminMailRoutingService(
        routing as never,
        accounts as never,
        audit as never,
      ),
      accounts,
      routing,
      audit,
    };
  };

  it("hesap oluşturma denetimi işlem içinde, şifre OLMADAN yazılır", async () => {
    const { service, audit } = build();

    await service.createAccount("admin-1", {
      address: "siparis@tarodan.com.tr",
      displayName: "Tarodan Sipariş",
      password: PLAIN,
    });

    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "mail_sender_account_create",
      "MailSenderAccount",
      "acc-1",
      null,
      view,
      TX,
    );
    expect(
      JSON.stringify(audit.createRequiredAuditLog.mock.calls),
    ).not.toContain(PLAIN);
  });

  it("şifre değişimi yalnız bayrakla izlenir", async () => {
    const { service, audit } = build();

    await service.updateAccount("admin-1", "acc-1", { password: PLAIN });

    const [, action, , , , after, tx] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect(action).toBe("mail_sender_account_update");
    expect(after).toMatchObject({ passwordChanged: true });
    expect(tx).toBe(TX);
    expect(
      JSON.stringify(audit.createRequiredAuditLog.mock.calls),
    ).not.toContain(PLAIN);
  });

  it("silme ve alan güncellemesi de zorunlu denetimle", async () => {
    const { service, audit } = build();

    await service.deleteAccount("admin-1", "acc-1");
    await service.updateArea("admin-1", "order", { replyTo: null });

    const actions = audit.createRequiredAuditLog.mock.calls.map((c) => c[1]);
    expect(actions).toEqual(["mail_sender_account_delete", "mail_area_update"]);
  });

  it("denetim yazılamazsa değişiklik hatayla döner", async () => {
    const { service, audit } = build();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));

    await expect(
      service.updateArea("admin-1", "order", { replyTo: null }),
    ).rejects.toThrow("audit down");
  });

  it("test gönderimi sonucu döner ve izlenir (best-effort)", async () => {
    const { service, audit } = build();

    const result = await service.testAccount(
      "admin-1",
      "acc-1",
      "serhat@tarodan.com.tr",
    );

    expect(result).toEqual({ ok: false, error: "Invalid login" });
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "mail_sender_account_test",
      "MailSenderAccount",
      "acc-1",
      null,
      { to: "serhat@tarodan.com.tr", ok: false, error: "Invalid login" },
    );
  });
});

describe("AdminMailRoutingController — okuma settings izniyle, yazma yalnız super_admin", () => {
  const writes = [
    "createAccount",
    "updateAccount",
    "deleteAccount",
    "testAccount",
    "updateArea",
  ] as const;

  const rolesOf = (method: keyof AdminMailRoutingController) =>
    Reflect.getMetadata(
      ROLES_KEY,
      AdminMailRoutingController.prototype[method],
    );

  it.each(writes)("%s yalnız super_admin'e açık", (method) => {
    expect(rolesOf(method)).toEqual([AdminRole.super_admin]);
  });

  it("okuma her admin rolüne açık; asıl kapı izin matrisidir", () => {
    expect(rolesOf("getState")).toEqual([
      AdminRole.super_admin,
      AdminRole.admin,
      AdminRole.moderator,
    ]);
  });

  it("segment izin matrisinde settings iznine bağlı (fail-closed değil)", () => {
    expect(PERMISSION_MAP["mail-routing"]).toEqual(["settings"]);
  });

  const contextFor = (role: string, method: "GET" | "PATCH") =>
    ({
      getHandler: () =>
        method === "GET"
          ? AdminMailRoutingController.prototype.getState
          : AdminMailRoutingController.prototype.updateArea,
      getClass: () => AdminMailRoutingController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role },
          method,
          originalUrl:
            method === "GET"
              ? "/api/admin/mail-routing"
              : "/api/admin/mail-routing/areas/order",
        }),
      }),
    }) as unknown as ExecutionContext;

  /** Rol matrisi: `settings` izni verilmiş roller (null = varsayılan matris). */
  const guard = (matrix: Record<string, string[]> | null) =>
    new RolesGuard(new Reflector(), {
      platformSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            matrix ? { settingValue: JSON.stringify(matrix) } : null,
          ),
      },
    } as never);

  const granted = {
    super_admin: ["settings"],
    admin: ["settings"],
    moderator: ["settings"],
  };

  it.each([AdminRole.admin, AdminRole.moderator])(
    "settings izni olan %s okuyabilir",
    async (role) => {
      await expect(
        guard(granted).canActivate(contextFor(role, "GET")),
      ).resolves.toBe(true);
    },
  );

  it.each([AdminRole.admin, AdminRole.moderator])(
    "settings izni olmayan %s okuyamaz (varsayılan matris)",
    async (role) => {
      await expect(
        guard(null).canActivate(contextFor(role, "GET")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each([AdminRole.admin, AdminRole.moderator])(
    "settings izni olsa da %s değiştiremez",
    async (role) => {
      await expect(
        guard(granted).canActivate(contextFor(role, "PATCH")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it("super_admin geçer", async () => {
    await expect(
      guard(null).canActivate(contextFor(AdminRole.super_admin, "PATCH")),
    ).resolves.toBe(true);
  });
});
