import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PaymentController } from "../payment.controller";
import { PaymentOptionalAuthService } from "./payment-optional-auth.service";

/**
 * POST /payments/direct-form isteğe bağlı kimlikli (@Public) bir uçtur.
 * Eskiden süresi dolmuş/geçersiz bir access token sessizce MİSAFİR'e
 * düşüyordu: 401 yok → istemci token'ı yenilemiyor, store_card kullanıcı
 * istediği için "kartımı kaydet" sessizce düşüyordu.
 *
 * Kural: kimlik bilgisi yok → misafir; geçerli → kullanıcı; VAR ama geçersiz
 * → geçerli ödeme yetki belirteci varsa misafir olarak sürer (ödeme ortasında
 * zorunlu çıkış yok), yoksa 401 (istemci yenileyip yeniden dener).
 */
describe("PaymentController.prepareDirectForm — optional auth", () => {
  const JWT_SECRET = "test-jwt-secret-for-direct-form-auth";
  const CAPABILITY_SECRET = "test-capability-secret-for-direct-form";
  const PAYMENT_ID = "f5e5e66d-c646-4b14-8ae7-85aa6de9be35";
  const ORDER_ID = "a1b2c3d4-0000-4000-8000-000000000001";

  const jwt = new JwtService({ secret: JWT_SECRET });
  const config = {
    get: (key: string) =>
      key === "PAYMENT_CAPABILITY_SECRET" ? CAPABILITY_SECRET : undefined,
    getOrThrow: () => JWT_SECRET,
  };

  type DbUser = {
    id: string;
    deletedAt?: Date | null;
    adminUser?: { id: string } | null;
    isBanned?: boolean;
  };

  function setup(users: DbUser[] = []) {
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
    const paymentService = {
      prepareDirectPayment: jest.fn().mockResolvedValue({ status: "pending" }),
    };
    const controller = new PaymentController(
      paymentService as never,
      jwt,
      config as never,
      {} as never,
      new PaymentOptionalAuthService(jwt, prisma as never),
    );
    return { controller, paymentService };
  }

  const access = (sub: string) =>
    jwt.sign({ sub, type: "access" }, { expiresIn: "15m" });
  // `exp` geçmişte: süresi dolmuş access token.
  const expiredAccess = (sub: string) =>
    jwt.sign({ sub, type: "access", exp: Math.floor(Date.now() / 1000) - 60 });
  const capabilityFor = (paymentId: string) =>
    jwt.sign(
      { sub: paymentId, type: "payment_capability" },
      { secret: CAPABILITY_SECRET, expiresIn: "2h" },
    );

  function request(opts: {
    bearer?: string;
    cookie?: string;
    capability?: string;
  }) {
    const headers: Record<string, string> = {};
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
    if (opts.cookie) headers.cookie = `access_token=${opts.cookie}`;
    if (opts.capability) headers["x-payment-capability"] = opts.capability;
    return { headers, body: {} } as never;
  }

  const dto = { orderId: ORDER_ID, saveCard: true };
  const capDto = { paymentId: PAYMENT_ID, orderId: ORDER_ID, saveCard: true };

  it("expired Bearer without a capability → 401, service never called", async () => {
    const { controller, paymentService } = setup([{ id: "user-1" }]);
    await expect(
      controller.prepareDirectForm(
        dto,
        request({ bearer: expiredAccess("user-1") }),
      ),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.auth.loginRequired" },
    });
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("forged / refresh-type token or expired cookie without a capability → 401", async () => {
    const { controller, paymentService } = setup([{ id: "user-1" }]);
    for (const req of [
      request({ bearer: "not-a-jwt" }),
      request({ bearer: jwt.sign({ sub: "user-1", type: "refresh" }) }),
      request({ cookie: expiredAccess("user-1") }),
    ]) {
      await expect(
        controller.prepareDirectForm(dto, req),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("expired Bearer WITH a valid payment capability → proceeds as guest (no forced logout)", async () => {
    const { controller, paymentService } = setup([{ id: "user-1" }]);
    await controller.prepareDirectForm(
      capDto,
      request({
        bearer: expiredAccess("user-1"),
        capability: capabilityFor(PAYMENT_ID),
      }),
    );
    expect(paymentService.prepareDirectPayment).toHaveBeenCalledWith(
      null,
      capDto,
      expect.anything(),
      true,
    );
  });

  it("a capability for ANOTHER payment does not excuse an expired token", async () => {
    const { controller, paymentService } = setup([{ id: "user-1" }]);
    await expect(
      controller.prepareDirectForm(
        capDto,
        request({
          bearer: expiredAccess("user-1"),
          capability: capabilityFor("00000000-0000-4000-8000-000000000000"),
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("no credentials at all → guest path with the payment capability still works", async () => {
    const { controller, paymentService } = setup();
    const guestDto = { paymentId: PAYMENT_ID, orderId: ORDER_ID };
    await expect(
      controller.prepareDirectForm(
        guestDto,
        request({ capability: capabilityFor(PAYMENT_ID) }),
      ),
    ).resolves.toEqual({ status: "pending" });
    expect(paymentService.prepareDirectPayment).toHaveBeenCalledWith(
      null,
      guestDto,
      expect.anything(),
      true,
    );
  });

  it("valid Bearer + saveCard → the signed-in user reaches the service", async () => {
    const { controller, paymentService } = setup([{ id: "user-1" }]);
    await controller.prepareDirectForm(
      dto,
      request({ bearer: access("user-1") }),
    );
    expect(paymentService.prepareDirectPayment).toHaveBeenCalledWith(
      "user-1",
      dto,
      expect.anything(),
      false,
    );
  });

  it("a still-valid token of a deleted, staff or banned account is NOT a user (401 / guest with capability)", async () => {
    const { controller, paymentService } = setup([
      { id: "deleted", deletedAt: new Date() },
      { id: "staff", adminUser: { id: "admin-1" } },
      { id: "banned", isBanned: true },
    ]);
    for (const sub of ["deleted", "staff", "banned", "missing"]) {
      await expect(
        controller.prepareDirectForm(dto, request({ bearer: access(sub) })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();

    await controller.prepareDirectForm(
      capDto,
      request({
        bearer: access("banned"),
        capability: capabilityFor(PAYMENT_ID),
      }),
    );
    expect(paymentService.prepareDirectPayment.mock.calls[0][0]).toBeNull();
  });

  it("resolves cookie before Bearer, exactly like JwtStrategy (guarded endpoints)", async () => {
    const { controller, paymentService } = setup([
      { id: "cookie-user" },
      { id: "bearer-user" },
    ]);
    await controller.prepareDirectForm(
      dto,
      request({ cookie: access("cookie-user"), bearer: access("bearer-user") }),
    );
    expect(paymentService.prepareDirectPayment.mock.calls[0][0]).toBe(
      "cookie-user",
    );
  });
});
