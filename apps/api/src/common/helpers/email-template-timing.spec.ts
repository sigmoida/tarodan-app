import { TIMING_RULES } from "@tarodan/types";
import {
  emailTimingValue,
  renderEmailTemplate,
} from "./email-template-renderer";
import { withEmailTimingData } from "../timing-rules";

/**
 * E-posta metinlerindeki iş süreleri şablon verisinin `timing` alanından gelir
 * (gönderim anında Süreler ve Kurallar'dan okunur); alan yoksa kayıt
 * varsayılanı kullanılır. Render katmanı DB'siz kalır.
 */
describe("email templates follow the configured durations", () => {
  const brand = { frontendUrl: "https://tarodan.com.tr" };

  describe("emailTimingValue", () => {
    it("timing alanı varsa onu kullanır", () => {
      expect(
        emailTimingValue(
          { timing: { returnWindowDays: 30 } },
          "returnWindowDays",
        ),
      ).toBe(30);
    });

    it("alan yoksa ya da geçersizse kayıt varsayılanına düşer", () => {
      const fallback = TIMING_RULES.returnWindowDays.default;
      expect(emailTimingValue({}, "returnWindowDays")).toBe(fallback);
      expect(emailTimingValue(undefined, "returnWindowDays")).toBe(fallback);
      expect(
        emailTimingValue(
          { timing: { returnWindowDays: 0 } },
          "returnWindowDays",
        ),
      ).toBe(fallback);
      expect(
        emailTimingValue(
          { timing: { returnWindowDays: "abc" } },
          "returnWindowDays",
        ),
      ).toBe(fallback);
    });
  });

  it("order-delivered: iade penceresi ayardan gelir", () => {
    const html = renderEmailTemplate(
      "order-delivered",
      { orderId: "o1", timing: { returnWindowDays: 30 } },
      brand,
    );

    expect(html).toContain("30 gün içinde koşulsuz iade");
    expect(html).toContain("30 günlük iade süresi dolduğunda");
    expect(html).not.toContain("14 gün");
  });

  it("order-delivered: timing yoksa bugünkü varsayılanı basar (davranış değişmez)", () => {
    const html = renderEmailTemplate(
      "order-delivered",
      { orderId: "o1" },
      brand,
    );

    expect(html).toContain(
      `${TIMING_RULES.returnWindowDays.default} gün içinde koşulsuz iade`,
    );
  });

  it("order-paid-seller: hazırlama süresi ve ödeme tarihi ayardan gelir", () => {
    const html = renderEmailTemplate(
      "order-paid-seller",
      {
        orderId: "o1",
        timing: { preparingDeadlineDays: 5, returnWindowDays: 21 },
      },
      brand,
    );

    expect(html).toContain("en geç 5 iş günü");
    expect(html).toContain("teslim aldıktan 21 gün sonra");
  });

  it("offer-received: bitiş tarihi yoksa teklif geçerlilik saatini basar", () => {
    const html = renderEmailTemplate(
      "offer-received",
      { timing: { offerExpiryHours: 48 } },
      brand,
    );

    expect(html).toContain("48 saat içinde dolacak");
  });

  describe("withEmailTimingData", () => {
    const row = (settingKey: string, settingValue: string) => ({
      settingKey,
      settingValue,
      updatedBy: "admin-1",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    it("gönderim anındaki ayarı veriye ekler", async () => {
      const db = {
        platformSetting: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              row(TIMING_RULES.returnWindowDays.settingKey, "30"),
            ]),
        },
      };

      const data = await withEmailTimingData(db, { orderId: "o1" });

      expect(data.orderId).toBe("o1");
      expect(data.timing?.returnWindowDays).toBe(30);
      expect(emailTimingValue(data, "returnWindowDays")).toBe(30);
    });

    it("ayarlar okunamazsa veriyi olduğu gibi döner (varsayılanla render edilir)", async () => {
      const db = {
        platformSetting: {
          findMany: jest.fn().mockRejectedValue(new Error("db down")),
        },
      };
      const input = { orderId: "o1" };

      const data = await withEmailTimingData(db, input);

      expect(data).toBe(input);
      expect(emailTimingValue(data, "returnWindowDays")).toBe(
        TIMING_RULES.returnWindowDays.default,
      );
    });

    it("çağıranın verdiği timing alanını ezmez ve DB'ye gitmez", async () => {
      const findMany = jest.fn();
      const input = { timing: { returnWindowDays: 7 } };

      const data = await withEmailTimingData(
        { platformSetting: { findMany } },
        input,
      );

      expect(data).toBe(input);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
