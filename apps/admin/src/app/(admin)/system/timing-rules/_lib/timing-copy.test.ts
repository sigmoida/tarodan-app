import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import { PAYTR_3DS_SESSION_MINUTES, TIMING_RULES } from "@tarodan/types";
import { helperParams } from "./timing-rules";

/**
 * Admin metinlerindeki süreler katalogda sabit sayı olarak durmaz: yardım
 * metinlerindeki sınırlar kayıttan, sipariş durum etiketindeki pencere
 * politikadan (`GET /timing-rules`) gelir. Her iki dilde, varsayılan
 * olmayan değerle, doğru çoğul biçimiyle basılır.
 */
describe("admin metinleri süre parametresiyle basılır", () => {
  const translator = (locale: "tr" | "en") =>
    createTranslator({ locale, messages: getMessages(locale) });

  describe("Süreler ve Kurallar yardım metinleri", () => {
    it("sınırlar kayıttan gelir (iade penceresi en az sayısı)", () => {
      const params = helperParams("returnWindowDays");
      expect(params.min).toBe(TIMING_RULES.returnWindowDays.min);

      expect(
        translator("tr")(
          "admin.timingRules.rules.returnWindowDays.helper",
          params,
        ),
      ).toContain(`en az ${params.min} gün`);
      expect(
        translator("en")(
          "admin.timingRules.rules.returnWindowDays.helper",
          params,
        ),
      ).toContain(`At least ${params.min} days`);
    });

    it("PayTR oturum süresi ve en az değer kayıttan gelir", () => {
      const params = helperParams("paymentFailTimeoutMinutes");
      expect(params.paytrSessionMinutes).toBe(PAYTR_3DS_SESSION_MINUTES);

      const tr = translator("tr")(
        "admin.timingRules.rules.paymentFailTimeoutMinutes.helper",
        params,
      );
      expect(tr).toContain(`${PAYTR_3DS_SESSION_MINUTES} dakika sürdüğü`);
      expect(tr).toContain(`en az ${params.min} dakika`);
    });

    it("en: en az 1 gün tekil, 14 gün çoğul yazılır", () => {
      const en = translator("en");
      expect(
        en("admin.timingRules.rules.payoutGraceDays.helper", {
          min: 1,
          max: 30,
          paytrSessionMinutes: 30,
        }),
      ).toContain("at least 1 day.");
      expect(
        en("admin.timingRules.rules.payoutGraceDays.helper", {
          min: 14,
          max: 30,
          paytrSessionMinutes: 30,
        }),
      ).toContain("at least 14 days.");
    });
  });

  describe("sipariş durum etiketi (iade penceresi)", () => {
    const key = "admin.operations.orders.status.awaitingBuyerConfirmation";

    it("tr: politika değerini basar", () => {
      expect(translator("tr")(key, { returnWindowDays: 30 })).toBe(
        "İade Penceresinde (30 gün)",
      );
    });

    it("en: çoğul biçimi doğru (1 day / 30 days)", () => {
      expect(translator("en")(key, { returnWindowDays: 1 })).toBe(
        "In Refund Window (1 day)",
      );
      expect(translator("en")(key, { returnWindowDays: 30 })).toBe(
        "In Refund Window (30 days)",
      );
    });
  });

  describe("hukuki çelişki uyarısı", () => {
    const key = "admin.timingRules.legalMismatchWarning";

    it("tr + en: metindeki sayıyı ve belge adlarını basar", () => {
      const values = { stated: 14, documents: "A, B" };
      expect(translator("tr")(key, values)).toContain(
        "14 gün olarak belirtiyor (A, B)",
      );
      expect(translator("en")(key, values)).toContain("as 14 days (A, B)");
    });
  });
});
