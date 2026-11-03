import type { Type } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorageService,
} from "@nestjs/throttler";
import { AdminRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../../../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../../../auth/guards/roles.guard";
import { ROLES_KEY } from "../../../auth/decorators/roles.decorator";
import { IS_ADMIN_ROUTE_KEY } from "../../../auth/decorators/admin-route.decorator";
import {
  AdminSellerTrustLabController,
  SELLER_TRUST_LAB_THROTTLES,
} from "./admin-seller-trust-lab.controller";

const THROTTLER_LIMIT = "THROTTLER:LIMITdefault";
const THROTTLER_TTL = "THROTTLER:TTLdefault";

type Handler = (...args: unknown[]) => unknown;
const handler = (name: string): Handler =>
  (
    AdminSellerTrustLabController.prototype as unknown as Record<
      string,
      Handler
    >
  )[name];

/**
 * The lab controller's declarative contract (plan 4.3): admin guards, the
 * super admin and admin roles (a moderator is refused by role before the
 * matrix), `no-store` on every route, and the per-route throttles (AC-A11,
 * AC-A15).
 */
describe("AdminSellerTrustLabController", () => {
  const routes = [
    ["params", SELLER_TRUST_LAB_THROTTLES.reference],
    ["scenarios", SELLER_TRUST_LAB_THROTTLES.reference],
    ["scenario", SELLER_TRUST_LAB_THROTTLES.reference],
    ["seller", SELLER_TRUST_LAB_THROTTLES.seller],
    ["population", SELLER_TRUST_LAB_THROTTLES.population],
  ] as const;

  it("lives under the seller-trust-lab admin segment behind the admin guards", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AdminSellerTrustLabController),
    ).toBe("admin/seller-trust-lab");
    expect(
      Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, AdminSellerTrustLabController),
    ).toBe(true);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminSellerTrustLabController),
    ).toEqual([AdminJwtAuthGuard, RolesGuard]);
  });

  it("admits super admin and admin only, on the class so no route can drop it", () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminSellerTrustLabController),
    ).toEqual([AdminRole.super_admin, AdminRole.admin]);
    for (const [name] of routes) {
      expect(Reflect.getMetadata(ROLES_KEY, handler(name))).toBeUndefined();
    }
  });

  it("pins the throttle limits", () => {
    expect(SELLER_TRUST_LAB_THROTTLES).toEqual({
      reference: 60,
      seller: 30,
      population: 6,
    });
  });

  it.each(routes)("%s: no-store, %i per minute", (name, limit) => {
    const h = handler(name);
    expect(Reflect.getMetadata(HEADERS_METADATA, h)).toEqual([
      { name: "Cache-Control", value: "no-store" },
    ]);
    expect(Reflect.getMetadata(THROTTLER_LIMIT, h)).toBe(limit);
    expect(Reflect.getMetadata(THROTTLER_TTL, h)).toBe(60_000);
  });

  it.each(["scenario", "seller", "population"])(
    "%s answers 200 (a read over POST)",
    (name) => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler(name))).toBe(200);
    },
  );

  describe("the real throttler guard", () => {
    let storage: ThrottlerStorageService;
    let guard: ThrottlerGuard;

    beforeEach(async () => {
      storage = new ThrottlerStorageService();
      guard = new ThrottlerGuard(
        { throttlers: [{ ttl: 60_000, limit: 1000 }] },
        storage,
        new Reflector(),
      );
      await guard.onModuleInit();
    });
    afterEach(() => storage.onApplicationShutdown());

    const hit = (name: string, ip: string) =>
      guard.canActivate(
        new ExecutionContextHost(
          [{ ip, headers: {} }, { header: jest.fn() }],
          AdminSellerTrustLabController as unknown as Type,
          handler(name),
        ),
      );

    it.each([
      ["population", SELLER_TRUST_LAB_THROTTLES.population],
      ["seller", SELLER_TRUST_LAB_THROTTLES.seller],
    ])(
      "refuses %s past its limit with 429 before the handler runs",
      async (name, limit) => {
        for (let i = 0; i < limit; i++) {
          await expect(hit(name, "31.200.1.1")).resolves.toBe(true);
        }
        await expect(hit(name, "31.200.1.1")).rejects.toBeInstanceOf(
          ThrottlerException,
        );
        // Another caller address has its own bucket.
        await expect(hit(name, "31.200.1.2")).resolves.toBe(true);
      },
    );
  });
});
