import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PaymentController } from "../payment.controller";

/**
 * POST /payments/direct-form isteğe bağlı kimlikli (@Public) bir uçtur.
 * Eskiden süresi dolmuş/geçersiz bir access token sessizce MİSAFİR'e
 * düşüyordu: 401 yok → istemci token'ı yenilemiyor, store_card kullanıcı
 * istediği için "kartımı kaydet" sessizce düşüyordu. Artık kimlik bilgisi
 * gönderilmiş ama geçersizse 401; hiç gönderilmemişse misafir yolu aynen çalışır.
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

  function setup() {
    const paymentService = {
      prepareDirectPayment: jest.fn().mockResolvedValue({ status: "pending" }),
    };
    const controller = new PaymentController(
      paymentService as never,
      jwt,
      config as never,
      {} as never,
    );
    return { controller, paymentService };
  }

  const access = (sub: string, expiresIn: string | number = "15m") =>
    jwt.sign({ sub, type: "access" }, { expiresIn });
  // `exp` geçmişte: süresi dolmuş access token.
  const expiredAccess = (sub: string) =>
    jwt.sign({
      sub,
      type: "access",
      exp: Math.floor(Date.now() / 1000) - 60,
    });

  function request(opts: {
    bearer?: string;
    cookie?: string;
    capability?: string;
    body?: Record<string, unknown>;
  }) {
    const headers: Record<string, string> = {};
    if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
    if (opts.cookie) headers.cookie = `access_token=${opts.cookie}`;
    if (opts.capability) headers["x-payment-capability"] = opts.capability;
    return { headers, body: opts.body ?? {} } as never;
  }

  const dto = { orderId: ORDER_ID, saveCard: true };

  it("expired Bearer → 401 and the payment service is never called", async () => {
    const { controller, paymentService } = setup();
    await expect(
      controller.prepareDirectForm(
        dto,
        request({ bearer: expiredAccess("user-1") }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("forged / wrong-type Bearer → 401", async () => {
    const { controller, paymentService } = setup();
    await expect(
      controller.prepareDirectForm(dto, request({ bearer: "not-a-jwt" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const refreshLike = jwt.sign({ sub: "user-1", type: "refresh" });
    await expect(
      controller.prepareDirectForm(dto, request({ bearer: refreshLike })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("expired auth cookie → 401", async () => {
    const { controller, paymentService } = setup();
    await expect(
      controller.prepareDirectForm(
        dto,
        request({ cookie: expiredAccess("user-1") }),
      ),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.auth.loginRequired" },
    });
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });

  it("no credentials at all → guest path with the payment capability still works", async () => {
    const { controller, paymentService } = setup();
    const capability = jwt.sign(
      { sub: PAYMENT_ID, type: "payment_capability" },
      { secret: CAPABILITY_SECRET, expiresIn: "2h" },
    );
    const guestDto = { paymentId: PAYMENT_ID, orderId: ORDER_ID };
    await expect(
      controller.prepareDirectForm(guestDto, request({ capability })),
    ).resolves.toEqual({ status: "pending" });
    expect(paymentService.prepareDirectPayment).toHaveBeenCalledWith(
      null,
      guestDto,
      expect.anything(),
      true,
    );
  });

  it("valid Bearer + saveCard → the signed-in user reaches the service", async () => {
    const { controller, paymentService } = setup();
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

  it("valid auth cookie (browser direct to API) keeps working", async () => {
    const { controller, paymentService } = setup();
    await controller.prepareDirectForm(
      dto,
      request({ cookie: access("user-2") }),
    );
    expect(paymentService.prepareDirectPayment.mock.calls[0][0]).toBe("user-2");
  });

  it("Bearer wins over the cookie when both are present", async () => {
    const valid = setup();
    await valid.controller.prepareDirectForm(
      dto,
      request({ bearer: access("bearer-user"), cookie: "stale-cookie" }),
    );
    expect(valid.paymentService.prepareDirectPayment.mock.calls[0][0]).toBe(
      "bearer-user",
    );

    // Süresi dolmuş Bearer, geçerli bir çerezle örtülmez: 401 → istemci yeniler.
    const expired = setup();
    await expect(
      expired.controller.prepareDirectForm(
        dto,
        request({
          bearer: expiredAccess("bearer-user"),
          cookie: access("cookie-user"),
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(expired.paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });
});
