import { AdminAuthController } from "../admin-auth.controller";
import { AuthController } from "../auth.controller";
import { NewsletterController } from "../../marketing/newsletter.controller";
import { OrderController } from "../../order/order.controller";
import { PaymentController } from "../../payment/payment.controller";
import { ConsentController } from "../../consent/consent.controller";
import { SignInMethodsController } from "../sign-in-methods/sign-in-methods.controller";
import { UserController } from "../../user/user.controller";
import { clientIpThrottleTracker } from "../../../common/helpers/client-ip";
import type { Type } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerStorageService,
} from "@nestjs/throttler";
import { GATEWAY_CLIENT_IP_HEADER } from "@tarodan/types";
import { readFileSync } from "fs";
import { resolve } from "path";

const THROTTLER_LIMIT_DEFAULT = "THROTTLER:LIMITdefault";
const THROTTLER_TTL_DEFAULT = "THROTTLER:TTLdefault";
const THROTTLER_TRACKER_DEFAULT = "THROTTLER:TRACKERdefault";

describe("critical public route throttles", () => {
  const cases: Array<{
    controller: { name: string; prototype: object };
    method: string;
    limit: number;
    /** Counted per client IP (`clientIpThrottle`), not per `req.ip`. */
    perClientIp?: boolean;
  }> = [
    {
      controller: AuthController,
      method: "registerBusiness",
      limit: 5,
    },
    {
      controller: AuthController,
      method: "refreshTokens",
      limit: 60,
    },
    {
      controller: AdminAuthController,
      method: "adminRefresh",
      limit: 60,
    },
    {
      controller: AuthController,
      method: "forgotPassword",
      limit: 3,
    },
    // E-posta doğrulama artık YALNIZ auth'ta. Security modülünde ikinci bir
    // uç vardı: token'ı ham saklıyor, mail hiç göndermiyor ve çağrıldığında
    // auth'un gönderdiği gerçek token'ı iptal ediyordu — kaldırıldı.
    {
      controller: AuthController,
      method: "verifyEmail",
      limit: 10,
    },
    {
      controller: AuthController,
      method: "resendVerification",
      limit: 3,
    },
    {
      controller: OrderController,
      method: "sendGuestCheckoutVerificationCode",
      limit: 3,
    },
    {
      controller: OrderController,
      method: "guestCheckout",
      limit: 10,
    },
    {
      controller: PaymentController,
      method: "getPaymentStatus",
      limit: 120,
    },
    {
      controller: NewsletterController,
      method: "subscribe",
      limit: 5,
    },
    // Routes with the setting-gated step-up (sign-in methods plan, T8b).
    {
      controller: UserController,
      method: "deleteAccount",
      limit: 5,
      perClientIp: true,
    },
    {
      controller: AuthController,
      method: "requestEmailChange",
      limit: 3,
      perClientIp: true,
    },
    {
      controller: AuthController,
      method: "verifyEmailChange",
      limit: 10,
      perClientIp: true,
    },
    // Step-up and the writes it guards (sign-in methods plan, 2026-10-21).
    {
      controller: SignInMethodsController,
      method: "reauthenticate",
      limit: 5,
      perClientIp: true,
    },
    {
      controller: SignInMethodsController,
      method: "setPassword",
      limit: 5,
      perClientIp: true,
    },
    {
      controller: SignInMethodsController,
      method: "linkGoogle",
      limit: 10,
      perClientIp: true,
    },
    {
      controller: SignInMethodsController,
      method: "linkApple",
      limit: 10,
      perClientIp: true,
    },
    {
      controller: SignInMethodsController,
      method: "unlinkProvider",
      limit: 10,
      perClientIp: true,
    },
    // Anonymous cookie preference record: keeps the table from growing unbounded.
    {
      controller: ConsentController,
      method: "recordCookies",
      limit: 10,
      perClientIp: true,
    },
  ];

  it.each(cases)(
    "limits $controller.name.$method to $limit requests per minute",
    ({ controller, method, limit }) => {
      const handler = (controller.prototype as Record<string, object>)[method];

      expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handler)).toBe(limit);
      expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, handler)).toBe(60000);
    },
  );

  // Web calls these through the gateway: a `req.ip` bucket would be the web
  // server's one address, so one web user could lock out every other.
  it.each(cases.filter((c) => c.perClientIp))(
    "counts $controller.name.$method per client IP",
    ({ controller, method }) => {
      const handler = (controller.prototype as Record<string, object>)[method];

      expect(Reflect.getMetadata(THROTTLER_TRACKER_DEFAULT, handler)).toBe(
        clientIpThrottleTracker,
      );
    },
  );

  // The metadata pin above proves which tracker a route names; this runs the
  // real ThrottlerGuard on that metadata, so it also proves the guard uses the
  // route's tracker and limit together (the buckets a client really gets).
  describe.each(cases.filter((c) => c.perClientIp))(
    "the real guard on $controller.name.$method",
    ({ controller, method, limit }) => {
      const GATEWAY = "172.18.0.4";
      let storage: ThrottlerStorageService;
      let guard: ThrottlerGuard;

      const hit = (ip: string, forwarded?: string) => {
        const handler = (
          controller.prototype as Record<
            string,
            (...args: unknown[]) => unknown
          >
        )[method];
        const req = {
          ip,
          headers: forwarded ? { [GATEWAY_CLIENT_IP_HEADER]: forwarded } : {},
        };
        const res = { header: jest.fn() };
        return guard.canActivate(
          new ExecutionContextHost(
            [req, res],
            controller as unknown as Type,
            handler,
          ),
        );
      };

      const exhaust = async (ip: string, forwarded?: string) => {
        for (let i = 0; i < limit; i++) {
          await expect(hit(ip, forwarded)).resolves.toBe(true);
        }
        await expect(hit(ip, forwarded)).rejects.toBeInstanceOf(
          ThrottlerException,
        );
      };

      beforeEach(async () => {
        storage = new ThrottlerStorageService();
        // The app's global limit (app.module.ts); the route limit overrides it.
        guard = new ThrottlerGuard(
          { throttlers: [{ ttl: 60000, limit: 1000 }] },
          storage,
          new Reflector(),
        );
        await guard.onModuleInit();
      });

      afterEach(() => storage.onApplicationShutdown());

      it("gives two browsers behind the gateway separate buckets", async () => {
        await exhaust(GATEWAY, "85.105.10.20");

        await expect(hit(GATEWAY, "85.105.10.21")).resolves.toBe(true);
      });

      it("keeps a gateway request without the header in the gateway's own bucket", async () => {
        await exhaust(GATEWAY, "85.105.10.20");

        // The old `req.ip` bucket: neither the browser's nor one the browsers
        // share with it.
        await exhaust(GATEWAY);
        await expect(hit(GATEWAY, "85.105.10.21")).resolves.toBe(true);
      });

      it("ignores the header from a public client (no escape by forging it)", async () => {
        await exhaust("31.200.1.1");

        await expect(hit("31.200.1.1", "85.105.10.22")).rejects.toBeInstanceOf(
          ThrottlerException,
        );
      });
    },
  );

  it("supports an explicit production-like throttling mode in E2E tests", () => {
    const appModule = readFileSync(
      resolve(__dirname, "../../../app.module.ts"),
      "utf8",
    );

    expect(appModule).toMatch(/skipIf:[\s\S]{0,200}TEST_THROTTLING_ENABLED/);
  });
});
