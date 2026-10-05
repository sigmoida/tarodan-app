import {
  ESCROW_RELEASE_DAYS,
  PAYOUT_GRACE_DAYS,
  REFUND_COOLING_OFF_DAYS,
} from "@tarodan/shared";
import {
  PAYTR_3DS_SESSION_MINUTES,
  PUBLIC_TIMING_RULE_IDS,
  TIMING_GROUPS,
  TIMING_RULES,
  TIMING_RULE_IDS,
  TIMING_RULE_INVARIANTS,
  findTimingInvariantViolation,
  isSelectableTimingAction,
  isTimingSettingKey,
  timingActionSettingKey,
  timingRulesInGroup,
  validateTimingAction,
  validateTimingValue,
  type TimingExpiryAction,
  type TimingRuleId,
} from "@tarodan/types";
import { defaultTimingValues } from "./timing-rules.resolver";

/**
 * SÖZLEŞME: Süreler ve Kurallar kaydı. Sonraki paketler (ilan, teklif+takas,
 * sipariş+iade, kullanıcı metinleri) bu kayda dayanır; buradaki her test bir
 * kaydın bugünkü davranışla uyumunu ya da doğrulamanın bir kuralını sabitler.
 */
describe("TIMING_RULES kaydı", () => {
  it("ayar anahtarları ve env anahtarları tekildir", () => {
    const settingKeys = TIMING_RULE_IDS.map(
      (id) => TIMING_RULES[id].settingKey,
    );
    const actionKeys = TIMING_RULE_IDS.map(timingActionSettingKey);
    const all = [...settingKeys, ...actionKeys];
    expect(new Set(all).size).toBe(all.length);

    const envKeys = TIMING_RULE_IDS.map((id) => TIMING_RULES[id].envKey).filter(
      (key): key is string => key !== null,
    );
    expect(new Set(envKeys).size).toBe(envKeys.length);
  });

  it.each(TIMING_RULE_IDS)(
    "%s — varsayılan tam sayı ve admin sınırları içinde",
    (id) => {
      const rule = TIMING_RULES[id];
      expect(Number.isInteger(rule.default)).toBe(true);
      expect(rule.min).toBeGreaterThanOrEqual(1);
      expect(rule.max).toBeGreaterThan(rule.min);
      expect(validateTimingValue(id, rule.default)).toBeNull();
    },
  );

  it.each(TIMING_RULE_IDS)(
    "%s — varsayılan eylem tanımlı, seçilebilir ve listenin başında",
    (id) => {
      const rule = TIMING_RULES[id];
      expect(rule.actions[0]).toEqual({
        action: rule.defaultAction,
        available: true,
      });
      expect(isSelectableTimingAction(id, rule.defaultAction)).toBe(true);
    },
  );

  it("her grup en az bir kayıt taşır ve her kayıt bilinen bir gruptadır", () => {
    for (const group of TIMING_GROUPS) {
      expect(timingRulesInGroup(group).length).toBeGreaterThan(0);
    }
    expect(
      TIMING_GROUPS.flatMap((group) => timingRulesInGroup(group)).sort(),
    ).toEqual([...TIMING_RULE_IDS].sort());
  });

  // Bugünkü davranış = varsayılan eylem. Sonraki paketler yalnız bayrağı çevirir.
  const LATER_ACTIONS = {
    offerExpiryHours: ["expire", "extend_once"],
    tradeResponseHours: ["cancel", "extend_once"],
    tradePaymentHours: ["cancel", "extend_once"],
    preparingDeadlineDays: ["cancel_and_refund", "extend_once"],
  } satisfies Partial<
    Record<TimingRuleId, [TimingExpiryAction, TimingExpiryAction]>
  >;

  it.each(Object.entries(LATER_ACTIONS))(
    "%s — gelecekteki seçeneği tanımlı ama henüz kapalı",
    (id, [current, later]) => {
      expect(TIMING_RULES[id as TimingRuleId].actions).toEqual([
        { action: current, available: true },
        { action: later, available: false },
      ]);
    },
  );

  // Bayrağı çevrilmiş (davranışı yazılmış) ikinci eylemler: ikisi de seçilebilir.
  const ENABLED_ACTIONS = {
    listingTtlDays: ["deactivate", "auto_renew"],
  } satisfies Partial<
    Record<TimingRuleId, [TimingExpiryAction, TimingExpiryAction]>
  >;

  it.each(Object.entries(ENABLED_ACTIONS))(
    "%s — ikinci eylemi açık ve seçilebilir",
    (id, [current, enabled]) => {
      expect(TIMING_RULES[id as TimingRuleId].actions).toEqual([
        { action: current, available: true },
        { action: enabled, available: true },
      ]);
      expect(isSelectableTimingAction(id as TimingRuleId, enabled)).toBe(true);
    },
  );

  it("diğer tüm kayıtlar tek eylemlidir", () => {
    const multi = TIMING_RULE_IDS.filter(
      (id) => TIMING_RULES[id].actions.length > 1,
    );
    expect(multi.sort()).toEqual(
      [...Object.keys(LATER_ACTIONS), ...Object.keys(ENABLED_ACTIONS)].sort(),
    );
  });

  it("süresi kayda damgalanmayan (sürmekte olanlara da uygulanan) kayıtlar işaretli", () => {
    // Bu kayıtlar her cron turunda "şimdi − N" ile hesaplanır: değişiklik
    // yürürlükteki kayıtları da etkiler, admin ekranı uyarı gösterir.
    expect(
      TIMING_RULE_IDS.filter((id) => TIMING_RULES[id].appliesToInProgress),
    ).toEqual([
      "listingTtlDays",
      "listingExpiryWarningDays",
      "tradeLostParcelGraceDays",
      "paymentReservationMinutes",
      "paymentFailTimeoutMinutes",
      "returnDropoffDays",
      "returnDropoffHardDays",
      "returnInspectionHours",
      "refundWaitDeliveryMaxDays",
      "shippedStaleAlertDays",
      "missingTrackingAlertHours",
      "carrierCancellationAlertHours",
      "invoiceDeadlineDays",
      "sellerInvoiceDeadlineDays",
      "cargoPickupNoDataDays",
      "cargoStaleMovementDays",
    ]);
    // İade penceresi teslimde siparişe damgalanır (Order.returnWindowEndsAt).
    expect(TIMING_RULES.returnWindowDays.appliesToInProgress).toBe(false);
  });

  it("varsayılan değerler tüm alanlar arası değişmezleri sağlar", () => {
    expect(
      findTimingInvariantViolation(defaultTimingValues(), TIMING_RULE_IDS),
    ).toBeNull();
  });

  it("herkese açık kayıtlar iç eşikleri (alarm, ödeme zaman aşımı) içermez", () => {
    for (const id of PUBLIC_TIMING_RULE_IDS) {
      expect(TIMING_RULES[id].group).not.toBe("alerts");
    }
    expect(PUBLIC_TIMING_RULE_IDS).not.toContain("paymentFailTimeoutMinutes");
    expect(PUBLIC_TIMING_RULE_IDS).not.toContain("paymentReservationMinutes");
  });

  it("bugünkü varsayılanları korur (env yokken davranış değişmez)", () => {
    expect(defaultTimingValues()).toEqual({
      listingTtlDays: 60,
      listingExpiryWarningDays: 7,
      offerExpiryHours: 24,
      tradeResponseHours: 72,
      tradePaymentHours: 48,
      tradeShippingDays: 7,
      tradeConfirmationDays: 3,
      tradeHoldDays: 3,
      tradeLostParcelGraceDays: 14,
      preparingDeadlineDays: 3,
      returnWindowDays: 14,
      orderPaymentWindowHours: 24,
      paymentReservationMinutes: 5,
      paymentFailTimeoutMinutes: 35,
      payoutGraceDays: 1,
      returnDropoffDays: 14,
      returnDropoffHardDays: 21,
      returnInspectionHours: 24,
      refundWaitDeliveryMaxDays: 30,
      shippedStaleAlertDays: 10,
      missingTrackingAlertHours: 24,
      carrierCancellationAlertHours: 24,
      invoiceDeadlineDays: 5,
      sellerInvoiceDeadlineDays: 7,
      cargoPickupNoDataDays: 3,
      cargoStaleMovementDays: 14,
    });
  });

  it("ön yüz geri düşüş sabitleri (@tarodan/shared) kayıt varsayılanlarıyla aynı", () => {
    expect(REFUND_COOLING_OFF_DAYS).toBe(TIMING_RULES.returnWindowDays.default);
    expect(PAYOUT_GRACE_DAYS).toBe(TIMING_RULES.payoutGraceDays.default);
    expect(ESCROW_RELEASE_DAYS).toBe(
      TIMING_RULES.returnWindowDays.default +
        TIMING_RULES.payoutGraceDays.default,
    );
  });
});

describe("değer doğrulaması (sınırlar)", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "akışı çökertecek %p değerini reddeder",
    (value) => {
      expect(validateTimingValue("tradeShippingDays", value)).not.toBeNull();
    },
  );

  it("iade penceresi 14 günün altına inemez", () => {
    expect(validateTimingValue("returnWindowDays", 13)).toEqual({
      code: "belowMin",
      min: 14,
    });
    expect(validateTimingValue("returnWindowDays", 14)).toBeNull();
  });

  it("payout grace ve takas hold en az 1 gün", () => {
    expect(validateTimingValue("payoutGraceDays", 0)).toEqual({
      code: "belowMin",
      min: 1,
    });
    expect(validateTimingValue("tradeHoldDays", 0)).toEqual({
      code: "belowMin",
      min: 1,
    });
    expect(validateTimingValue("payoutGraceDays", 1)).toBeNull();
    expect(validateTimingValue("tradeHoldDays", 1)).toBeNull();
  });

  it("ödeme fail penceresi PayTR 3DS oturumuna ya da altına inemez", () => {
    expect(
      validateTimingValue(
        "paymentFailTimeoutMinutes",
        PAYTR_3DS_SESSION_MINUTES,
      ),
    ).toEqual({ code: "belowMin", min: PAYTR_3DS_SESSION_MINUTES + 1 });
    expect(
      validateTimingValue(
        "paymentFailTimeoutMinutes",
        PAYTR_3DS_SESSION_MINUTES + 1,
      ),
    ).toBeNull();
  });

  it("üst sınırı aşan değeri reddeder", () => {
    expect(
      validateTimingValue(
        "listingTtlDays",
        TIMING_RULES.listingTtlDays.max + 1,
      ),
    ).toEqual({ code: "aboveMax", max: TIMING_RULES.listingTtlDays.max });
  });

  it.each(TIMING_RULE_IDS)(
    "%s — min ve max sınırın kendisi geçerlidir",
    (id) => {
      expect(validateTimingValue(id, TIMING_RULES[id].min)).toBeNull();
      expect(validateTimingValue(id, TIMING_RULES[id].max)).toBeNull();
      expect(validateTimingValue(id, TIMING_RULES[id].min - 1)).not.toBeNull();
      expect(validateTimingValue(id, TIMING_RULES[id].max + 1)).not.toBeNull();
    },
  );
});

describe("eylem doğrulaması", () => {
  it("açık eylemi kabul eder", () => {
    expect(validateTimingAction("listingTtlDays", "deactivate")).toBeNull();
  });

  it("henüz açılmamış eylemi reddeder", () => {
    expect(
      validateTimingAction("preparingDeadlineDays", "extend_once"),
    ).toEqual({ code: "actionUnavailable" });
  });

  it("kayıtta tanımsız eylemi reddeder", () => {
    expect(validateTimingAction("tradeHoldDays", "deactivate")).toEqual({
      code: "actionNotAllowed",
    });
    expect(validateTimingAction("tradeHoldDays", "anything")).toEqual({
      code: "actionNotAllowed",
    });
  });
});

describe("alanlar arası değişmezler", () => {
  const withValues = (patch: Partial<Record<TimingRuleId, number>>) => ({
    ...defaultTimingValues(),
    ...patch,
  });

  it("emniyet supabı drop-off penceresinin altına inemez", () => {
    expect(
      findTimingInvariantViolation(withValues({ returnDropoffHardDays: 13 }), [
        "returnDropoffHardDays",
      ]),
    ).toEqual({
      id: "returnDropoffHardDays",
      violation: {
        code: "invariant",
        invariant: "dropoffHardNotBelowDropoff",
        other: "returnDropoffDays",
      },
    });
    // Eşit olabilir (kod `Math.max` ile zaten eşitliğe çeker).
    expect(
      findTimingInvariantViolation(withValues({ returnDropoffHardDays: 14 }), [
        "returnDropoffHardDays",
      ]),
    ).toBeNull();
  });

  it("drop-off penceresi emniyet supabını aşacak şekilde büyütülemez", () => {
    expect(
      findTimingInvariantViolation(withValues({ returnDropoffDays: 22 }), [
        "returnDropoffDays",
      ]),
    ).toEqual({
      id: "returnDropoffDays",
      violation: {
        code: "invariant",
        invariant: "dropoffHardNotBelowDropoff",
        other: "returnDropoffHardDays",
      },
    });
  });

  it("ikisi birlikte büyütülürse geçerlidir", () => {
    expect(
      findTimingInvariantViolation(
        withValues({ returnDropoffDays: 30, returnDropoffHardDays: 40 }),
        ["returnDropoffDays", "returnDropoffHardDays"],
      ),
    ).toBeNull();
  });

  it("ilan uyarısı ilan süresinden kısa olmalı (eşit de olamaz)", () => {
    expect(
      findTimingInvariantViolation(
        withValues({ listingTtlDays: 10, listingExpiryWarningDays: 10 }),
        ["listingExpiryWarningDays"],
      ),
    ).toMatchObject({
      id: "listingExpiryWarningDays",
      violation: { invariant: "listingWarningBeforeTtl" },
    });
    expect(
      findTimingInvariantViolation(withValues({ listingTtlDays: 7 }), [
        "listingTtlDays",
      ]),
    ).toMatchObject({ id: "listingTtlDays" });
  });

  it("değişmeyen kayıtların mevcut ihlali yeni değişikliği engellemez", () => {
    // Env'den gelen eski bir değer değişmezi bozuyor olabilir; ilgisiz bir
    // kaydı düzenleyen admin bunun yüzünden kilitlenmemeli.
    expect(
      findTimingInvariantViolation(
        withValues({ returnDropoffHardDays: 5, offerExpiryHours: 12 }),
        ["offerExpiryHours"],
      ),
    ).toBeNull();
  });
});

describe("isTimingSettingKey", () => {
  it("değer ve eylem anahtarlarını tanır, diğerlerini tanımaz", () => {
    expect(isTimingSettingKey("payment_hold_days")).toBe(true);
    expect(isTimingSettingKey("offer_expiry_hours")).toBe(true);
    expect(isTimingSettingKey("listing_ttl_days_on_expiry")).toBe(true);
    expect(isTimingSettingKey("max_message_length")).toBe(false);
    expect(isTimingSettingKey("distance_sales_consent_required")).toBe(false);
  });
});
