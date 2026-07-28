import { AdminAuthController } from "../admin-auth.controller";
import { AuthController } from "../auth.controller";
import { NewsletterController } from "../../marketing/newsletter.controller";
import { OrderController } from "../../order/order.controller";
import { PaymentController } from "../../payment/payment.controller";
import { SecurityController } from "../../security/security.controller";
import { readFileSync } from "fs";
import { resolve } from "path";

const THROTTLER_LIMIT_DEFAULT = "THROTTLER:LIMITdefault";
const THROTTLER_TTL_DEFAULT = "THROTTLER:TTLdefault";

describe("critical public route throttles", () => {
  const cases: Array<{
    controller: any;
    method: string;
    limit: number;
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
      controller: SecurityController,
      method: "requestPasswordReset",
      limit: 3,
    },
    {
      controller: SecurityController,
      method: "verifyEmail",
      limit: 10,
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
  ];

  it.each(cases)(
    "limits $controller.name.$method to $limit requests per minute",
    ({ controller, method, limit }) => {
      const handler = controller.prototype[method];

      expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handler)).toBe(limit);
      expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, handler)).toBe(60000);
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
