import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PaymentController } from "../payment.controller";
import { PaymentOptionalAuthService } from "./payment-optional-auth.service";

/**
 * POST /payments/installment-options is @Public with an optional JWT, like
 * direct-form (ADR 0019, plan 5.2). The controller decides who the service
 * sees: the signed-in user, and whether `x-payment-capability` is valid FOR
 * THE PAYMENT IN THE BODY. The service trusts that flag for guest access to
 * a payment's prices, so a capability of another payment, or one sent in
 * amount mode, must never reach it as authorized.
 */
describe("PaymentController.getInstallmentOptions — caller resolution", () => {
  const JWT_SECRET = "test-jwt-secret-for-installment-options";
  const CAPABILITY_SECRET = "test-capability-secret-for-installment-options";
  const PAYMENT_ID = "f5e5e66d-c646-4b14-8ae7-85aa6de9be35";
  const OTHER_PAYMENT_ID = "00000000-0000-4000-8000-000000000000";

  const jwt = new JwtService({ secret: JWT_SECRET });
  const config = {
    get: (key: string) =>
      key === "PAYMENT_CAPABILITY_SECRET" ? CAPABILITY_SECRET : undefined,
    getOrThrow: () => JWT_SECRET,
  };

  function setup(users: Array<{ id: string; isBanned?: boolean }> = []) {
    const byId = new Map(users.map((u) => [u.id, u]));
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const u = byId.get(where.id);
          return u
            ? {
                email: `${u.id}@test`,
                isSeller: false,
                preferredLanguage: "tr",
                deletedAt: null,
                adminUser: null,
                isBanned: false,
                ...u,
              }
            : null;
        }),
      },
    };
    const installmentOptions = {
      getOptions: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const controller = new PaymentController(
      {} as never,
      jwt,
      config as never,
      {} as never,
      new PaymentOptionalAuthService(jwt, prisma as never),
      installmentOptions as never,
    );
    return { controller, installmentOptions };
  }

  const access = (sub: string) =>
    jwt.sign({ sub, type: "access" }, { expiresIn: "15m" });
  const expiredAccess = (sub: string) =>
    jwt.sign({ sub, type: "access", exp: Math.floor(Date.now() / 1000) - 60 });
  const capabilityFor = (paymentId: string) =>
    jwt.sign(
      { sub: paymentId, type: "payment_capability" },
      { secret: CAPABILITY_SECRET, expiresIn: "2h" },
    );

  function request(
    body: Record<string, unknown>,
    opts: { bearer?: string; capability?: string } = {},
  ) {
    const headers: Record<string, string> = {};
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
    if (opts.capability) headers["x-payment-capability"] = opts.capability;
    return { headers, body } as never;
  }

  const paymentDto = { bin: "45467112", paymentId: PAYMENT_ID };
  const amountDto = { bin: "45467112", amount: 1000 };

  it("passes a capability of THIS payment as authorized, with no user", async () => {
    const { controller, installmentOptions } = setup();
    await controller.getInstallmentOptions(
      paymentDto,
      request(paymentDto, { capability: capabilityFor(PAYMENT_ID) }),
    );
    expect(installmentOptions.getOptions).toHaveBeenCalledWith(paymentDto, {
      userId: null,
      capabilityAuthorized: true,
    });
  });

  it.each`
    case                                           | token
    ${"a capability of another payment"}           | ${() => capabilityFor(OTHER_PAYMENT_ID)}
    ${"an access token in the header"}             | ${() => access(PAYMENT_ID)}
    ${"a capability signed with the wrong secret"} | ${() => jwt.sign({ sub: PAYMENT_ID, type: "payment_capability" })}
    ${"garbage"}                                   | ${() => "not-a-jwt"}
  `(
    "never passes $case as authorized",
    async ({ token }: { token: () => string }) => {
      const { controller, installmentOptions } = setup();
      await controller.getInstallmentOptions(
        paymentDto,
        request(paymentDto, { capability: token() }),
      );
      expect(installmentOptions.getOptions).toHaveBeenCalledWith(paymentDto, {
        userId: null,
        capabilityAuthorized: false,
      });
    },
  );

  it("ignores a capability in amount mode (no payment to authorize)", async () => {
    const { controller, installmentOptions } = setup();
    await controller.getInstallmentOptions(
      amountDto,
      request(amountDto, { capability: capabilityFor(PAYMENT_ID) }),
    );
    expect(installmentOptions.getOptions).toHaveBeenCalledWith(amountDto, {
      userId: null,
      capabilityAuthorized: false,
    });
  });

  it("passes the signed-in buyer's id", async () => {
    const { controller, installmentOptions } = setup([{ id: "user-1" }]);
    await controller.getInstallmentOptions(
      paymentDto,
      request(paymentDto, { bearer: access("user-1") }),
    );
    expect(installmentOptions.getOptions).toHaveBeenCalledWith(paymentDto, {
      userId: "user-1",
      capabilityAuthorized: false,
    });
  });

  it("answers 401 for an expired or banned token without this payment's capability, before pricing", async () => {
    const { controller, installmentOptions } = setup([
      { id: "user-1" },
      { id: "banned", isBanned: true },
    ]);
    for (const req of [
      request(amountDto, { bearer: expiredAccess("user-1") }),
      request(amountDto, { bearer: access("banned") }),
      request(paymentDto, {
        bearer: expiredAccess("user-1"),
        capability: capabilityFor(OTHER_PAYMENT_ID),
      }),
    ]) {
      const dto = (req as unknown as { body: typeof paymentDto }).body;
      await expect(
        controller.getInstallmentOptions(dto, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(installmentOptions.getOptions).not.toHaveBeenCalled();
  });

  it("lets an expired token through as a guest when it holds this payment's capability", async () => {
    const { controller, installmentOptions } = setup([{ id: "user-1" }]);
    await controller.getInstallmentOptions(
      paymentDto,
      request(paymentDto, {
        bearer: expiredAccess("user-1"),
        capability: capabilityFor(PAYMENT_ID),
      }),
    );
    expect(installmentOptions.getOptions).toHaveBeenCalledWith(paymentDto, {
      userId: null,
      capabilityAuthorized: true,
    });
  });
});
