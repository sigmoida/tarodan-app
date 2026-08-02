import { GUARDS_METADATA, METHOD_METADATA } from "@nestjs/common/constants";
import { IS_ADMIN_ROUTE_KEY } from "../decorators/admin-route.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppModule } from "../../../app.module";

/**
 * SÖZLEŞME: @AdminRoute() ile admin guard'ı HER ZAMAN çift gider — tüm
 * uygulama, metod düzeyi dahil.
 *
 * İki tehlikeli tekil desen var:
 *  1. Admin guard VAR, @AdminRoute YOK → global JwtAuthGuard normal kullanıcı
 *     cookie'sini arar, admin oturumunun her isteği 401 yer ve panel o sayfada
 *     "expired=session" ile login'e düşer (yaşandı: /system/media).
 *  2. @AdminRoute VAR, hiçbir guard YOK → global guard atlanır ve endpoint
 *     TAMAMEN KORUMASIZ kalır (dışarıya açık admin ucu).
 *
 * AdminModule'e özel tarama admin-route-decorator.spec'te; burası bütün modül
 * ağacını (karışık controller'lardaki metod düzeyi kullanım dahil) kapsar.
 */

type Ctor = new (...args: never[]) => unknown;

function collectControllers(root: unknown): Ctor[] {
  const seen = new Set<unknown>();
  const controllers = new Set<Ctor>();
  const visit = (mod: unknown): void => {
    if (!mod || seen.has(mod)) return;
    seen.add(mod);
    const target = (mod as { module?: unknown }).module ?? mod;
    if (target !== mod) {
      visit(target);
      return;
    }
    for (const ctrl of Reflect.getMetadata("controllers", mod) ?? []) {
      controllers.add(ctrl);
    }
    for (const imported of Reflect.getMetadata("imports", mod) ?? []) {
      visit(imported);
    }
  };
  visit(root);
  return [...controllers];
}

const ADMIN_GUARD_NAMES = new Set(["AdminJwtAuthGuard", "AdminAuthGuard"]);

function guardNames(target: object): string[] {
  const guards: Array<{ name?: string } | undefined> =
    Reflect.getMetadata(GUARDS_METADATA, target) ?? [];
  return guards.map((g) => g?.name ?? "").filter(Boolean);
}

interface Violation {
  where: string;
  problem: string;
}

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const ctrl of collectControllers(AppModule)) {
    const classAdminRoute = !!Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, ctrl);
    const classGuards = guardNames(ctrl);
    const proto = ctrl.prototype as Record<string, unknown>;

    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const handler = proto[name];
      if (typeof handler !== "function") continue;
      // Yalnız gerçek route handler'ları (HTTP metodu metadata'sı taşıyanlar).
      if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;

      const methodAdminRoute = !!Reflect.getMetadata(
        IS_ADMIN_ROUTE_KEY,
        handler,
      );
      const isPublic =
        !!Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
        !!Reflect.getMetadata(IS_PUBLIC_KEY, ctrl);
      const allGuards = [...classGuards, ...guardNames(handler)];
      const hasAdminGuard = allGuards.some((g) => ADMIN_GUARD_NAMES.has(g));
      const isAdminRoute = classAdminRoute || methodAdminRoute;
      const where = `${ctrl.name}.${name}`;

      if (hasAdminGuard && !isAdminRoute) {
        violations.push({
          where,
          problem: "admin guard var, @AdminRoute yok → her istek 401",
        });
      }
      if (isAdminRoute && !isPublic && allGuards.length === 0) {
        violations.push({
          where,
          problem: "@AdminRoute var, hiçbir guard yok → endpoint korumasız",
        });
      }
    }
  }
  return violations;
}

describe("admin route / guard pairing (app-wide, method level)", () => {
  it("finds controllers to scan", () => {
    expect(collectControllers(AppModule).length).toBeGreaterThan(10);
  });

  it("has no unpaired admin guard or unguarded admin route", () => {
    expect(scan()).toEqual([]);
  });
});
