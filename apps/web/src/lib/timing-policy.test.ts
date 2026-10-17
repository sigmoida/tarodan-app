/** @format */

import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import { getMessages } from "@tarodan/i18n";
import { PAYOUT_GRACE_DAYS, REFUND_COOLING_OFF_DAYS } from "@tarodan/shared";
import { timingMessageValues, type PublicTimingPolicy } from "@tarodan/types";
import type { Translate } from "@/types/i18n";
import {
  FALLBACK_TIMING_POLICY,
  addCalendarDays,
  loadWebTimingPolicy,
  parseWebTimingPolicy,
  withTimingValues,
} from "./timing-policy";

/**
 * Politika süreleri — süre metinleri ve tarih kararları sabit sayıyı değil
 * `GET /timing-rules` değerini izler; uç yoksa geri düşüş devreye girer.
 */

/** Uç yanıtının şekli: `{ [kimlik]: { value, unit } }`. */
const policyWith = (
  overrides: Partial<Record<keyof PublicTimingPolicy, number>>,
) =>
  Object.fromEntries(
    Object.entries(FALLBACK_TIMING_POLICY).map(([id, entry]) => [
      id,
      {
        ...entry,
        value: overrides[id as keyof PublicTimingPolicy] ?? entry.value,
      },
    ]),
  );

describe("geri düşüş", () => {
  it("iade penceresi ve payout grace @tarodan/shared sabitlerinden gelir", () => {
    expect(FALLBACK_TIMING_POLICY.returnWindowDays.value).toBe(
      REFUND_COOLING_OFF_DAYS,
    );
    expect(FALLBACK_TIMING_POLICY.payoutGraceDays.value).toBe(
      PAYOUT_GRACE_DAYS,
    );
  });

  it("uç hata verirse (ağ/5xx) geri düşüş döner, istisna fırlatmaz", async () => {
    const load = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(loadWebTimingPolicy(load)).resolves.toEqual(
      FALLBACK_TIMING_POLICY,
    );
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("gövde bozuksa (null/dizi/metin) geri düşüş döner", async () => {
    for (const body of [null, undefined, [], "oops", 42]) {
      await expect(loadWebTimingPolicy(async () => body)).resolves.toEqual(
        FALLBACK_TIMING_POLICY,
      );
    }
  });

  it("başarılı yanıttaki değerleri kullanır", async () => {
    const policy = await loadWebTimingPolicy(async () =>
      policyWith({ returnWindowDays: 30, orderPaymentWindowHours: 48 }),
    );
    expect(policy.returnWindowDays.value).toBe(30);
    expect(policy.orderPaymentWindowHours.value).toBe(48);
  });

  it("geçersiz kimlik yalnız kendi değeri için geri düşer", () => {
    const parsed = parseWebTimingPolicy({
      ...policyWith({ returnWindowDays: 30 }),
      offerExpiryHours: { value: 0, unit: "hours" },
      preparingDeadlineDays: { value: "5", unit: "days" },
      listingTtlDays: null,
    });
    expect(parsed.returnWindowDays.value).toBe(30);
    expect(parsed.offerExpiryHours.value).toBe(
      FALLBACK_TIMING_POLICY.offerExpiryHours.value,
    );
    expect(parsed.preparingDeadlineDays.value).toBe(
      FALLBACK_TIMING_POLICY.preparingDeadlineDays.value,
    );
    expect(parsed.listingTtlDays.value).toBe(
      FALLBACK_TIMING_POLICY.listingTtlDays.value,
    );
  });

  it("ondalık değeri aşağı yuvarlar, birimi kayıttan okur", () => {
    const parsed = parseWebTimingPolicy({
      returnWindowDays: { value: 20.9, unit: "hours" },
    });
    expect(parsed.returnWindowDays).toEqual({ value: 20, unit: "days" });
  });
});

describe("varsayılan dışı değerle metin", () => {
  const render = (locale: "tr" | "en", policy: unknown) => {
    const t = createTranslator({ locale, messages: getMessages(locale) });
    return withTimingValues(
      t as unknown as Translate,
      parseWebTimingPolicy(policy),
    );
  };

  it("tr: iade süresi metni politika değerini basar", () => {
    const t = render("tr", policyWith({ returnWindowDays: 30 }));
    expect(t("order.refundWindowPassed")).toContain("30 günlük iade süresi");
    expect(t("order.refundWindowPassed")).not.toContain("14");
  });

  it("en: iade süresi metni politika değerini basar", () => {
    const t = render("en", policyWith({ returnWindowDays: 30 }));
    expect(t("order.refundWindowPassed")).toContain("30-day refund window");
  });

  it("en: çoğul biçimi doğru (1 day / 30 days)", () => {
    expect(
      render("en", policyWith({ returnWindowDays: 1 }))("order.payoutRelease"),
    ).toContain("released 1 day after delivery");
    expect(
      render("en", policyWith({ returnWindowDays: 30 }))("order.payoutRelease"),
    ).toContain("released 30 days after delivery");
  });

  it("en: saatlik ödeme süresi çoğul biçimi (1 hour / 48 hours)", () => {
    expect(
      render(
        "en",
        policyWith({ orderPaymentWindowHours: 1 }),
      )("offer.firstToPayWinsSeller"),
    ).toContain("1 hour to pay");
    expect(
      render(
        "en",
        policyWith({ orderPaymentWindowHours: 48 }),
      )("offer.firstToPayWinsSeller"),
    ).toContain("48 hours to pay");
  });

  it("tr: teklif kabul metni ödeme süresini politikadan alır", () => {
    const t = render("tr", policyWith({ orderPaymentWindowHours: 72 }));
    expect(t("offer.acceptConfirmDescBuyer")).toContain("72 saat içinde");
  });

  it("çağıranın verdiği değer politikayı ezer", () => {
    const t = render("tr", policyWith({ returnWindowDays: 30 }));
    expect(t("order.payoutReleaseWithDate", { date: "1 Ocak" })).toContain(
      "30 gün sonra serbest bırakılır (1 Ocak)",
    );
    expect(t("order.refundWindowPassed", { returnWindowDays: 7 })).toContain(
      "7 günlük",
    );
  });

  it("ICU parametre adları kayıt kimlikleriyle birebir", () => {
    const values = timingMessageValues(FALLBACK_TIMING_POLICY);
    expect(values.returnWindowDays).toBe(REFUND_COOLING_OFF_DAYS);
    expect(Object.keys(values)).toContain("orderPaymentWindowHours");
  });
});

describe("addCalendarDays", () => {
  it("takvim günü ekler (backend ile aynı aritmetik)", () => {
    const end = addCalendarDays("2026-01-01T10:00:00Z", 14);
    expect(end?.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("geçersiz tarih için null döner", () => {
    expect(addCalendarDays("not-a-date", 14)).toBeNull();
  });
});
