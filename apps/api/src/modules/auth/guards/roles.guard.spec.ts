import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { BYPASS_PERMISSION_MATRIX_KEY } from "../decorators/bypass-permission-matrix.decorator";

/**
 * retry-refund gibi gerçek-para iadesi tetikleyen endpoint @RequirePermission('refund_requests')
 * ile korunmalı: moderator (refund izni yok) engellenmeli, admin/super_admin geçmeli.
 * Bu, URL segmenti "trades" olduğu için iadenin yanlışlıkla 'trades' iznine düşmesini
 * (moderator'ın iadeyi retry edebilmesini) engelleyen düzeltmenin regresyon testi.
 */
describe("RolesGuard — refund_requests izin kapısı (retry-refund money-path)", () => {
  const makeGuard = () => {
    // platformSetting yok → DEFAULT_ROLE_PERMISSIONS kullanılır
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    const reflector = new Reflector();
    return new RolesGuard(reflector, prisma);
  };

  const makeContext = (role: string): ExecutionContext => {
    const req = {
      user: { isAdmin: true, role },
      method: "POST",
      originalUrl: "/api/admin/trades/abc/retry-refund",
    };
    // @Roles(super_admin, admin, moderator) + @RequirePermission('refund_requests')
    const handler = () => undefined;
    (handler as any)[ROLES_KEY] = ["super_admin", "admin", "moderator"];
    (handler as any)[PERMISSION_KEY] = "refund_requests";
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  };

  // Reflector.getAllAndOverride'ı handler metadata'sından okuyacak şekilde stub'la
  const stubReflector = (guard: RolesGuard) => {
    const r: Reflector = (guard as any).reflector;
    jest
      .spyOn(r, "getAllAndOverride")
      .mockImplementation((key: any, targets: any[]) => {
        const h = targets[0];
        if (key === ROLES_KEY) return h?.[ROLES_KEY];
        if (key === PERMISSION_KEY) return h?.[PERMISSION_KEY];
        if (key === BYPASS_PERMISSION_MATRIX_KEY) return undefined;
        return undefined;
      });
  };

  it("moderator → iadeyi retry EDEMEZ (refund_requests izni yok)", async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(
      guard.canActivate(makeContext("moderator")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin → iadeyi retry edebilir (refund_requests izni var)", async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(guard.canActivate(makeContext("admin"))).resolves.toBe(true);
  });

  it("super_admin → her zaman geçer", async () => {
    const guard = makeGuard();
    stubReflector(guard);
    await expect(guard.canActivate(makeContext("super_admin"))).resolves.toBe(
      true,
    );
  });
});

/**
 * Admin iade yüzeyi — URL-segment tabanlı izin kapısı (explicit @RequirePermission
 * OLMAYAN endpoint'ler). RolesGuard URL'in ilk admin segmentinden izin türetir
 * (PERMISSION_MAP). İade işlemleri 'refund_requests'/'payments'
 * izni ister; moderator bu izinlere sahip olmadığından TÜM iade yüzeyinden bloke
 * olmalı, admin/super_admin geçmeli. (H1–H4, H6, H7 karakterizasyonu.)
 */
describe("RolesGuard — admin iade yüzeyi URL-segment izin kapısı", () => {
  const makeGuard = () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    return new RolesGuard(new Reflector(), prisma);
  };

  const ctx = (
    role: string,
    method: string,
    originalUrl: string,
  ): ExecutionContext => {
    const req = { user: { isAdmin: true, role }, method, originalUrl };
    const handler = () => undefined;
    // Tüm bu endpoint'lerde @Roles var ama explicit @RequirePermission YOK.
    (handler as any)[ROLES_KEY] = ["super_admin", "admin", "moderator"];
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  };

  const stub = (guard: RolesGuard) => {
    jest
      .spyOn((guard as any).reflector as Reflector, "getAllAndOverride")
      .mockImplementation((key: any, targets: any[]) => {
        const h = targets[0];
        if (key === ROLES_KEY) return h?.[ROLES_KEY];
        return undefined; // explicit permission / bypass yok
      });
  };

  // [açıklama, method, url]
  const refundSurfaces: Array<[string, string, string]> = [
    ["iade listesi", "GET", "/api/admin/refund-requests"],
    ["iade detayı", "GET", "/api/admin/refund-requests/abc"],
    ["force-finalize", "POST", "/api/admin/refund-requests/abc/force-finalize"],
    [
      "override-policy",
      "PATCH",
      "/api/admin/refund-requests/abc/override-policy",
    ],
    [
      "set-shipping-payer",
      "PATCH",
      "/api/admin/refund-requests/abc/set-shipping-payer",
    ],
    ["manual-refund", "POST", "/api/admin/payments/abc/manual-refund"],
  ];

  describe("moderator iade yüzeyinin TAMAMINDAN bloke", () => {
    it.each(refundSurfaces)("moderator → %s → 403", async (_d, method, url) => {
      const guard = makeGuard();
      stub(guard);
      await expect(
        guard.canActivate(ctx("moderator", method, url)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("admin & super_admin iade yüzeyine erişebilir", () => {
    it.each(refundSurfaces)("admin → %s → izinli", async (_d, method, url) => {
      const guard = makeGuard();
      stub(guard);
      await expect(guard.canActivate(ctx("admin", method, url))).resolves.toBe(
        true,
      );
    });

    it.each(refundSurfaces)(
      "super_admin → %s → izinli",
      async (_d, method, url) => {
        const guard = makeGuard();
        stub(guard);
        await expect(
          guard.canActivate(ctx("super_admin", method, url)),
        ).resolves.toBe(true);
      },
    );
  });
});

/**
 * Fail-closed: kanonik /api/admin/<segment> route'u PERMISSION_MAP'te eşlenmemişse
 * (ör. yeni eklenip izin haritasına yazılması unutulmuş) erişim reddedilir —
 * moderator/admin sessizce sadece-rol kontrolüne düşemez. super_admin escape-hatch
 * olarak geçer. Bilinen rol-only istisnalar (invoices, seller-invoices) ve
 * kanonik olmayan /module/admin/... route'ları fail-OPEN
 * kalır (mevcut moderator erişimi korunur — MOD-045 regresyon koruması).
 */
describe("RolesGuard — eşlenmemiş admin route fail-closed", () => {
  const makeGuard = () => {
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    return new RolesGuard(new Reflector(), prisma);
  };

  const ctx = (
    role: string,
    method: string,
    originalUrl: string,
  ): ExecutionContext => {
    const req = { user: { isAdmin: true, role }, method, originalUrl };
    const handler = () => undefined;
    (handler as any)[ROLES_KEY] = ["super_admin", "admin", "moderator"];
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  };

  const stub = (guard: RolesGuard) => {
    jest
      .spyOn((guard as any).reflector as Reflector, "getAllAndOverride")
      .mockImplementation((key: any, targets: any[]) => {
        const h = targets[0];
        if (key === ROLES_KEY) return h?.[ROLES_KEY];
        return undefined;
      });
  };

  const UNKNOWN = "/api/admin/brand-new-feature/abc";

  it("moderator → eşlenmemiş kanonik admin route → 403 (fail-closed)", async () => {
    const guard = makeGuard();
    stub(guard);
    await expect(
      guard.canActivate(ctx("moderator", "GET", UNKNOWN)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("admin → eşlenmemiş kanonik admin route → 403 (fail-closed, super_admin değil)", async () => {
    const guard = makeGuard();
    stub(guard);
    await expect(
      guard.canActivate(ctx("admin", "POST", UNKNOWN)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("super_admin → eşlenmemiş kanonik admin route → izinli (escape-hatch)", async () => {
    const guard = makeGuard();
    stub(guard);
    await expect(
      guard.canActivate(ctx("super_admin", "GET", UNKNOWN)),
    ).resolves.toBe(true);
  });

  it.each([
    ["invoices", "/api/admin/invoices"],
    ["seller-invoices", "/api/admin/seller-invoices/abc"],
  ])(
    "moderator → rol-only istisna (%s) → izinli (fail-open korunur)",
    async (_d, url) => {
      const guard = makeGuard();
      stub(guard);
      await expect(
        guard.canActivate(ctx("moderator", "GET", url)),
      ).resolves.toBe(true);
    },
  );

  it("moderator → kanonik olmayan /module/admin/... (support tickets) → izinli (MOD-045 korunur)", async () => {
    const guard = makeGuard();
    stub(guard);
    await expect(
      guard.canActivate(
        ctx("moderator", "PATCH", "/api/support/admin/tickets/abc/status"),
      ),
    ).resolves.toBe(true);
  });
});

describe("RolesGuard — permission store failure", () => {
  it("fails closed instead of restoring default financial permissions", async () => {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn().mockRejectedValue(new Error("database down")),
      },
    } as any;
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector, prisma);
    const handler = () => undefined;
    (handler as any)[ROLES_KEY] = ["admin"];
    (handler as any)[PERMISSION_KEY] = "refund_requests";
    jest
      .spyOn(reflector, "getAllAndOverride")
      .mockImplementation((key: any) => {
        if (key === ROLES_KEY) return (handler as any)[ROLES_KEY];
        if (key === PERMISSION_KEY) return (handler as any)[PERMISSION_KEY];
        return undefined;
      });
    const context = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({
          user: { isAdmin: true, role: "admin" },
          method: "POST",
          originalUrl: "/api/admin/refund-requests/abc/force-finalize",
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
