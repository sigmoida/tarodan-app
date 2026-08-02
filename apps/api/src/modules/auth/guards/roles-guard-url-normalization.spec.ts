import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { BYPASS_PERMISSION_MATRIX_KEY } from "../decorators/bypass-permission-matrix.decorator";

/**
 * İzin matrisi URL'den çözüldüğü için URL AYRIŞTIRMASI güvenlik sınırının
 * parçasıdır. İki kaçış yolu kapatılır:
 *
 *  1. BÜYÜK/KÜÇÜK HARF: Express varsayılan olarak harfe duyarsız yönlendirir
 *     (`case sensitive routing` açılmadı), yani /api/ADMIN/payouts aynı
 *     handler'a düşer. Guard segmenti harfe duyarlı okusaydı "admin" bulunamaz,
 *     izin anahtarı çözülemez ve istek yalnızca ROL kontrolüne düşerdi →
 *     moderator, matrisin vermediği payouts/payments/refund uçlarına erişirdi.
 *  2. "admin" ADLI PATH PARAMETRESİ: segment `lastIndexOf("admin")` ile
 *     bulunuyordu; /api/admin/email-templates/admin gibi bir URL'de işaretçi
 *     SONA kayıyor, segment boş kalıyor ve matris yine atlanıyordu.
 *
 * Modül içine gömülü (/api/<modül>/admin/...) route'ların mevcut davranışı
 * korunmalı — onlar sınıf düzeyi @RequirePermission ile korunuyor.
 */
describe("RolesGuard — URL normalizasyonu (matris atlatma)", () => {
  const makeGuard = () => {
    // platformSetting yok → DEFAULT_ROLE_PERMISSIONS kullanılır
    const prisma = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    } as any;
    return new RolesGuard(new Reflector(), prisma);
  };

  const makeContext = (role: string, originalUrl: string): ExecutionContext => {
    const req = { user: { isAdmin: true, role }, method: "GET", originalUrl };
    const handler = () => undefined;
    (handler as any)[ROLES_KEY] = ["super_admin", "admin", "moderator"];
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
  };

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

  const run = (role: string, url: string) => {
    const guard = makeGuard();
    stubReflector(guard);
    return guard.canActivate(makeContext(role, url));
  };

  it("moderator, BÜYÜK harfli /api/ADMIN/payouts ile matrisi atlayamaz", async () => {
    await expect(
      run("moderator", "/api/ADMIN/payouts/transfers"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("moderator, karışık harfli /api/Admin/payments ile matrisi atlayamaz", async () => {
    await expect(
      run("moderator", "/api/Admin/payments/abc/manual-refund"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("'admin' adlı path parametresi segmenti kaydıramaz", async () => {
    // email_templates izni moderator'da YOK → son segment "admin" olsa bile red.
    await expect(
      run("moderator", "/api/admin/email-templates/admin"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("izni olan rol büyük harfli URL'de de geçer (kilitleme değil, düzeltme)", async () => {
    await expect(run("admin", "/api/ADMIN/payouts/transfers")).resolves.toBe(
      true,
    );
  });

  it("normal küçük harfli URL davranışı değişmez", async () => {
    await expect(run("admin", "/api/admin/payouts/transfers")).resolves.toBe(
      true,
    );
    await expect(
      run("moderator", "/api/admin/payouts/transfers"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("modül içine gömülü admin route'ları (kanonik olmayan) fail-open kalır", async () => {
    // /api/support/admin/tickets → segment "tickets", haritada yok, kanonik değil
    // → yalnız rol kontrolü (sınıf düzeyi @RequirePermission bunları korur).
    await expect(run("moderator", "/api/support/admin/tickets")).resolves.toBe(
      true,
    );
  });
});
