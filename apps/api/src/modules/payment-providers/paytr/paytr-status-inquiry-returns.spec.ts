import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PayTRService } from "./paytr.service";

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
});
