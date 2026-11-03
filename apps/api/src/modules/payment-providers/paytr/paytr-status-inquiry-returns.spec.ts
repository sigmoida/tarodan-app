import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PayTRService } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Durum-sorgu yanıtının İADE (`returns`) ve KESİNTİ (`kesinti_tutari`/`net_tutar`)
 * alanlarının parse edilmesi:
 *  - `returns[].reference_no` iade denemesi (RefundAttempt) eşlemesinde kullanılır —
 *    sonucu belirsiz (manual_review) iadelerin otomatik çözümü buna dayanır.
 *  - `kesinti_tutari`/`net_tutar` PayTR'nin işlem komisyonudur; PSP ücret
 *    mutabakatı için denetim günlüğüne yazılır.
 * Tutarlar PayTR'de virgüllü gelebilir ("0,24") — parsePaytrMoneyString ile okunur.
 */
describe("PayTRService.queryPaymentStatus — returns + kesinti alanları", () => {
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

  afterEach(() => fetchSpy.mockRestore());

  it("parses kesinti_tutari/net_tutar (virgüllü) and the returns array", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "100,00",
          payment_amount: "100,00",
          currency: "TL",
          kesinti_tutari: "2,35",
          net_tutar: "97,65",
          returns: [
            {
              return_amount: "50.00",
              return_date: "2026-08-01 10:00:00",
              return_type: "iade",
              reference_no: "aaaabbbbcccc",
            },
            {
              // reference_no'suz iade (bizim göndermediğimiz eski/harici iade)
              return_amount: "10,00",
              return_date: "2026-08-01 11:00:00",
            },
          ],
        }),
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerFeeTl).toBeCloseTo(2.35);
    expect(r.providerNetTl).toBeCloseTo(97.65);
    expect(r.returns).toHaveLength(2);
    expect(r.returns?.[0]).toMatchObject({
      amountTl: 50,
      referenceNo: "aaaabbbbcccc",
    });
    // reference_no yoksa alan undefined kalmalı (boş string DEĞİL) — eşleme
    // mantığı "referanssız iade" ayrımını buna göre yapar.
    expect(r.returns?.[1].referenceNo).toBeUndefined();
    expect(r.returns?.[1].amountTl).toBeCloseTo(10);
  });

  it("omits fee/returns fields when PayTR does not send them", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "100,00",
          payment_amount: "100,00",
          currency: "TL",
        }),
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerFeeTl).toBeUndefined();
    expect(r.providerNetTl).toBeUndefined();
    expect(r.returns).toEqual([]);
  });
  // Regression: the parser read `installment_count`, which durum-sorgu does
  // not send, so a payment recovered by inquiry never stored its count.
  // Durum Sorgu (https://dev.paytr.com/durum-sorgu) documents `taksit`
  // (0, 2-12), `kart_marka`, `masked_pan` and `odeme_tipi` (KART | EFT).
  it("reads taksit, kart_marka, masked_pan and odeme_tipi", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "1066,50",
          payment_amount: "1000,00",
          currency: "TL",
          taksit: "6",
          kart_marka: "WORLD",
          masked_pan: "455359******6747",
          odeme_tipi: "KART",
        }),
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.installmentCount).toBe(6);
    expect(r.cardBrand).toBe("WORLD");
    expect(r.maskedPan).toBe("455359******6747");
    expect(r.paymentType).toBe("card");
    expect(r.paymentTotalTl).toBeCloseTo(1066.5);
    expect(r.paymentAmountTl).toBeCloseTo(1000);
  });

  it("reads a single payment as taksit 0", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "100,00",
          payment_amount: "100,00",
          taksit: 0,
          odeme_tipi: "EFT",
        }),
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.installmentCount).toBe(0);
    expect(r.paymentType).toBe("eft");
  });

  it.each([["13"], ["abc"], ["2.5"], [""], [-1]])(
    "leaves installmentCount undefined for an invalid taksit %p",
    async (taksit) => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            payment_total: "100,00",
            taksit,
          }),
      });

      const r = await service.queryPaymentStatus("ORDER123");

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.installmentCount).toBeUndefined();
      expect(r.cardBrand).toBeUndefined();
      expect(r.maskedPan).toBeUndefined();
    },
  );
  // The answer carries card data (`masked_pan`): a parse warning must not
  // log the answer itself.
  it("does not log the answer when payment_total cannot be parsed", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "n/a",
          masked_pan: "455359******6747",
        }),
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(false);
    const logged = warn.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("ORDER123");
    expect(logged).not.toContain("455359");
    warn.mockRestore();
  });

  it("masks digit runs when the answer is not JSON", async () => {
    const error = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    fetchSpy.mockResolvedValue({
      status: 200,
      text: async () => '{"status":"success","masked_pan":"455359******6747"',
    });

    const r = await service.queryPaymentStatus("ORDER123");

    expect(r.ok).toBe(false);
    const logged = error.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).toContain("ORDER123");
    expect(logged).not.toContain("455359");
    expect(logged).not.toContain("6747");
    error.mockRestore();
  });
});
