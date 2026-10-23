import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import {
  ProviderRefundNotSentException,
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
} from "../refund-errors";
import { PayTRService } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

describe("PayTRService", () => {
  let service: PayTRService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRReportService,
        PayTRTransferService,
        PayTRService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "PAYTR_MERCHANT_ID") return "merchant_id_1";
              if (key === "PAYTR_MERCHANT_KEY") return "merchant_key_xx";
              if (key === "PAYTR_MERCHANT_SALT") return "merchant_salt_yy";
              if (key === "PAYTR_TEST_MODE") return "true";
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PayTRService);
    fetchSpy = jest.spyOn(
      global,
      "fetch" as never,
    ) as unknown as jest.SpyInstance;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("parsePaytrMoneyString", () => {
    it("parses Turkish comma decimal", () => {
      expect(PayTRService.parsePaytrMoneyString("10,8")).toBe(10.8);
      expect(PayTRService.parsePaytrMoneyString("99,90")).toBeCloseTo(99.9);
    });

    it("parses dot decimal", () => {
      expect(PayTRService.parsePaytrMoneyString("100.5")).toBe(100.5);
    });
  });

  describe("queryPaymentStatus", () => {
    it("returns success with TL amounts when PayTR responds success", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            payment_total: "99,90",
            payment_amount: "99,90",
            currency: "TL",
            payment_date: "2024-01-01 12:00:00",
          }),
      });

      const r = await service.queryPaymentStatus("ORDER123");

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.paymentTotalTl).toBeCloseTo(99.9);
        expect(r.paymentAmountTl).toBeCloseTo(99.9);
        expect(r.currency).toBe("TL");
      }

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/durum-sorgu",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );
      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      expect(body).toContain("merchant_oid=ORDER123");
      expect(body).toMatch(/paytr_token=/);
    });

    it("returns ok false on PayTR error status", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "error",
            err_no: "004",
            err_msg: "Failed to find successful payment with merchant_oid",
          }),
      });

      const r = await service.queryPaymentStatus("missing");
      expect(r.ok).toBe(false);
      if (r.ok === false) {
        expect(r.errMsg).toContain("merchant_oid");
      }
    });
  });

  describe("createRefund (gerçek PayTR iade çağrısı)", () => {
    const okResp = () => ({
      text: async () => JSON.stringify({ status: "success" }),
    });

    it("D1: prod iade endpoint'ine return_amount=ONDALIK TL ile POST eder (KURUŞ DEĞİL)", async () => {
      fetchSpy.mockResolvedValue(okResp());

      await service.createRefund("ORDER123", 10.5);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/iade",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );
      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      // Ondalık TL "10.50" gönderilmeli; "1050" (kuruş) gönderilirse 100× iade = maddi kayıp.
      expect(body).toContain("return_amount=10.50");
      expect(body).not.toContain("return_amount=1050");
      expect(body).toContain("merchant_oid=ORDER123");
      expect(body).toMatch(/paytr_token=/);
    });

    it("D4: merchant_oid içindeki tireler temizlenir (ödeme yakalamasıyla eşleşsin)", async () => {
      fetchSpy.mockResolvedValue(okResp());

      await service.createRefund("a1b2-c3d4-e5f6", 5);

      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      expect(body).toContain("merchant_oid=a1b2c3d4e5f6");
    });

    it("D2: PayTR status!=success → BadRequest (err_msg ile)", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({ status: "error", err_msg: "iade limiti aşıldı" }),
      });

      await expect(service.createRefund("ORDER123", 10)).rejects.toThrow(
        /iade limiti aşıldı/,
      );
    });

    it("D2b: boş/geçersiz PayTR yanıtı → BadRequest", async () => {
      fetchSpy.mockResolvedValue({ text: async () => "" });

      await expect(service.createRefund("ORDER123", 10)).rejects.toThrow();
    });

    it("D5: reference_no verilirse alfanumerik normalize edilip gönderilir", async () => {
      fetchSpy.mockResolvedValue(okResp());

      // refundAttempt.id UUID'dir (tireli) — PayTR alfanümerik ister.
      await service.createRefund("ORDER123", 10, "a1b2c3d4-e5f6-7890");

      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      expect(body).toContain("reference_no=a1b2c3d4e5f67890");
    });

    it("D5b: reference_no verilmezse parametre hiç gönderilmez", async () => {
      fetchSpy.mockResolvedValue(okResp());

      await service.createRefund("ORDER123", 10);

      const body = (fetchSpy.mock.calls[0][1] as RequestInit).body as string;
      expect(body).not.toContain("reference_no");
    });

    it("D5c: reference_no hash'e KATILMAZ (doküman: token = id+oid+amount+salt)", async () => {
      fetchSpy.mockResolvedValue(okResp());

      await service.createRefund("ORDER123", 10, "ref-birinci");
      fetchSpy.mockResolvedValue(okResp());
      await service.createRefund("ORDER123", 10, "ref-ikinci");

      const tokenOf = (call: unknown[]) =>
        new URLSearchParams((call[1] as RequestInit).body as string).get(
          "paytr_token",
        );
      // Aynı oid+tutar, farklı referans → token AYNI kalmalı; referansı hash'e
      // katmak PayTR tarafında hash uyuşmazlığıyla iadeyi reddettirir.
      expect(tokenOf(fetchSpy.mock.calls[0])).toBe(
        tokenOf(fetchSpy.mock.calls[1]),
      );
    });
  });

  /**
   * D1 (refund sweep loop, Sentry TARODAN-API-3N): what a failed refund call
   * means for the money. A connect-phase failure never reached PayTR, so the
   * refund may be resent; anything after the request left the host is an
   * unknown outcome. "Nothing left to refund" is flagged so the caller parks
   * the attempt for a person instead of resending it forever. The service
   * logs one warn line: the caller decides how loud a failed refund is.
   */
  describe("createRefund failure outcomes", () => {
    const networkError = (code: string) =>
      Object.assign(new TypeError("fetch failed"), { cause: { code } });
    const errorBody = (err_msg: string) => ({
      text: async () => JSON.stringify({ status: "error", err_msg }),
    });
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      errorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    const rejection = async () => {
      try {
        await service.createRefund("ORDER123", 10, "attempt-1");
      } catch (error) {
        return error as Error;
      }
      throw new Error("createRefund did not throw");
    };

    it.each([
      "UND_ERR_CONNECT_TIMEOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ])(
      "a connect-phase failure (%s) is 'not sent', with its cause code",
      async (code) => {
        fetchSpy.mockRejectedValue(networkError(code));

        const error = await rejection();

        expect(error).toBeInstanceOf(ProviderRefundNotSentException);
        expect((error as ProviderRefundNotSentException).detail).toContain(
          code,
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      },
    );

    it("Happy Eyeballs: every address failing to connect is still 'not sent'", async () => {
      fetchSpy.mockRejectedValue(
        Object.assign(new TypeError("fetch failed"), {
          cause: {
            code: "ETIMEDOUT",
            errors: [
              { code: "ETIMEDOUT", syscall: "connect" },
              { code: "ENETUNREACH", syscall: "connect" },
            ],
          },
        }),
      );

      expect(await rejection()).toBeInstanceOf(ProviderRefundNotSentException);
    });

    it.each(["ECONNRESET", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT"])(
      "a failure after the request left the host (%s) is an unknown outcome",
      async (code) => {
        fetchSpy.mockRejectedValue(networkError(code));

        const error = await rejection();

        expect(error).toBeInstanceOf(ProviderRefundOutcomeUnknownException);
        expect(error).not.toBeInstanceOf(ProviderRefundNotSentException);
      },
    );

    it("our own timeout and a bare 'fetch failed' are unknown outcomes", async () => {
      const timeout = Object.assign(
        new Error("The operation was aborted due to timeout"),
        { name: "TimeoutError" },
      );
      fetchSpy.mockRejectedValueOnce(timeout);
      expect(await rejection()).toBeInstanceOf(
        ProviderRefundOutcomeUnknownException,
      );

      fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));
      expect(await rejection()).toBeInstanceOf(
        ProviderRefundOutcomeUnknownException,
      );
    });

    it("a body that cannot be read is an unknown outcome", async () => {
      fetchSpy.mockResolvedValue({
        text: async () => {
          throw networkError("ECONNRESET");
        },
      });

      expect(await rejection()).toBeInstanceOf(
        ProviderRefundOutcomeUnknownException,
      );
    });

    it.each([
      "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.",
      "Talep edilen iade tutari (10.5 TL), kalan tutardan (0.00 TL) fazla olamaz.",
      "iade tutari kalan tutardan (0) fazla olamaz",
    ])(
      "PayTR's 'nothing left to refund' is a flagged rejection: %s",
      async (errMsg) => {
        fetchSpy.mockResolvedValue(errorBody(errMsg));

        const error = await rejection();

        expect(error).toBeInstanceOf(ProviderRefundRejectedException);
        expect(error.message).toBe(errMsg);
        expect(
          (error as ProviderRefundRejectedException).nothingLeftToRefund,
        ).toBe(true);
      },
    );

    it.each([
      "Talep edilen iade tutari (349 TL), kalan tutardan (15 TL) fazla olamaz.",
      "Talep edilen iade tutari (349 TL), kalan tutardan (0.50 TL) fazla olamaz.",
      "odeme henuz siteye bildirilmemis",
    ])("any other rejection is not flagged: %s", async (errMsg) => {
      fetchSpy.mockResolvedValue(errorBody(errMsg));

      const error = await rejection();

      expect(error).toBeInstanceOf(ProviderRefundRejectedException);
      expect(
        (error as ProviderRefundRejectedException).nothingLeftToRefund,
      ).toBe(false);
    });

    it("logs one warn line per failure and never an error (the caller alarms)", async () => {
      fetchSpy.mockResolvedValueOnce(
        errorBody(
          "Talep edilen iade tutari (1556 TL), kalan tutardan (0 TL) fazla olamaz.",
        ),
      );
      await rejection();
      fetchSpy.mockRejectedValueOnce(networkError("UND_ERR_CONNECT_TIMEOUT"));
      await rejection();
      fetchSpy.mockRejectedValueOnce(networkError("ECONNRESET"));
      await rejection();
      fetchSpy.mockResolvedValueOnce({ text: async () => "" });
      await rejection();

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(4);
      expect(warnSpy.mock.calls.map((call) => call[0])).toEqual([
        expect.stringContaining("rejected"),
        expect.stringContaining("UND_ERR_CONNECT_TIMEOUT"),
        expect.stringContaining("ECONNRESET"),
        expect.stringContaining("ORDER123"),
      ]);
    });
  });
});
