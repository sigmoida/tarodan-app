import {
  TIMING_RULES,
  TIMING_RULE_IDS,
  timingActionSettingKey,
} from "@tarodan/types";
import {
  defaultTimingValues,
  loadTimingRuleStates,
  loadTimingValues,
  parseTimingValue,
  pickTimingAction,
  pickTimingValue,
  resolveTimingAction,
  resolveTimingValue,
} from "./timing-rules.resolver";

/** Anahtar → değer haritasından env okuyucusu. */
const envOf = (values: Record<string, string> = {}) => ({
  get: (key: string) => values[key],
});

/** Anahtar → ayar değeri haritasından tekil okuyucu. */
const settingReader = (rows: Record<string, string> = {}) => ({
  platformSetting: {
    findUnique: jest.fn(
      async ({ where }: { where: { settingKey: string } }) =>
        where.settingKey in rows
          ? { settingValue: rows[where.settingKey] }
          : null,
    ),
  },
});

/** Anahtar → ayar değeri haritasından toplu okuyucu. */
const listReader = (rows: Record<string, string> = {}, updatedAt?: Date) => ({
  platformSetting: {
    findMany: jest.fn(
      async ({ where }: { where: { settingKey: { in: string[] } } }) =>
        Object.entries(rows)
          .filter(([key]) => where.settingKey.in.includes(key))
          .map(([settingKey, settingValue]) => ({
            settingKey,
            settingValue,
            updatedAt: updatedAt ?? new Date("2026-10-01T00:00:00.000Z"),
          })),
    ),
  },
});

describe("parseTimingValue", () => {
  it("pozitif sayıyı aşağı yuvarlayarak kabul eder", () => {
    expect(parseTimingValue("14")).toBe(14);
    expect(parseTimingValue(" 7 ")).toBe(7);
    expect(parseTimingValue("2.9")).toBe(2);
  });

  it.each([undefined, null, "", "   ", "abc", "0", "-3", "0.5", "NaN"])(
    "%p katmanı yok sayar (pencere sıfırlanmaz)",
    (raw) => {
      expect(parseTimingValue(raw as string | null | undefined)).toBeNull();
    },
  );
});

describe("pickTimingValue — çözüm sırası: ayar → env → varsayılan", () => {
  it("ayar satırı env'i ve varsayılanı ezer", () => {
    expect(
      pickTimingValue(
        "returnWindowDays",
        "21",
        envOf({ RETURN_WINDOW_DAYS: "30" }),
      ),
    ).toEqual({ value: 21, source: "setting" });
  });

  it("ayar yoksa eski env değişkenine düşer", () => {
    expect(
      pickTimingValue(
        "returnWindowDays",
        undefined,
        envOf({ RETURN_WINDOW_DAYS: "30" }),
      ),
    ).toEqual({ value: 30, source: "env" });
  });

  it("ayar da env de yoksa kayıt varsayılanı", () => {
    expect(pickTimingValue("returnWindowDays", undefined, envOf())).toEqual({
      value: 14,
      source: "default",
    });
  });

  it("geçersiz ayar env'e, geçersiz env varsayılana düşer", () => {
    expect(
      pickTimingValue(
        "offerExpiryHours",
        "0",
        envOf({ OFFER_EXPIRY_HOURS: "48" }),
      ),
    ).toEqual({ value: 48, source: "env" });
    expect(
      pickTimingValue(
        "offerExpiryHours",
        "abc",
        envOf({ OFFER_EXPIRY_HOURS: "sıfır" }),
      ),
    ).toEqual({ value: 24, source: "default" });
  });

  it("env'i olmayan kayıt (takas) env'e hiç bakmaz", () => {
    const env = { get: jest.fn() };
    expect(pickTimingValue("tradeResponseHours", undefined, env)).toEqual({
      value: 72,
      source: "default",
    });
    expect(env.get).not.toHaveBeenCalled();
  });

  it("env'deki eski değer admin sınırlarının dışında olsa da bugünkü gibi geçerlidir", () => {
    // Admin en az 14 gün kaydedebilir; ama bugün env'de 7 yazan bir kurulum
    // deploy ile sessizce 14'e çıkmamalı.
    expect(
      pickTimingValue(
        "returnWindowDays",
        undefined,
        envOf({ RETURN_WINDOW_DAYS: "7" }),
      ),
    ).toEqual({ value: 7, source: "env" });
  });
});

describe("resolveTimingValue", () => {
  it("kaydın ayar anahtarını okur ve sırayı uygular", async () => {
    const db = settingReader({ trade_shipping_deadline_days: "10" });
    await expect(resolveTimingValue(db, "tradeShippingDays")).resolves.toBe(
      10,
    );
    expect(db.platformSetting.findUnique).toHaveBeenCalledWith({
      where: { settingKey: "trade_shipping_deadline_days" },
    });
  });

  it("satır yokken verilen env okuyucusuna düşer", async () => {
    await expect(
      resolveTimingValue(
        settingReader(),
        "paymentFailTimeoutMinutes",
        envOf({ PAYMENT_FAIL_TIMEOUT_MINUTES: "45" }),
      ),
    ).resolves.toBe(45);
  });

  it.each(TIMING_RULE_IDS)(
    "%s — admin değeri ve env yokken bugünkü varsayılanı döner",
    async (id) => {
      await expect(
        resolveTimingValue(settingReader(), id, envOf()),
      ).resolves.toBe(TIMING_RULES[id].default);
    },
  );
});

describe("eylem çözümü", () => {
  it("satır yoksa bugünkü davranış (defaultAction)", async () => {
    await expect(
      resolveTimingAction(settingReader(), "listingTtlDays"),
    ).resolves.toBe("deactivate");
  });

  it("henüz açılmamış bir eylem DB'ye yazılmış olsa bile uygulanmaz", () => {
    expect(pickTimingAction("listingTtlDays", "auto_renew")).toBe(
      "deactivate",
    );
    expect(pickTimingAction("offerExpiryHours", "extend_once")).toBe("expire");
  });

  it("kayıtta tanımsız eylem varsayılana düşer", () => {
    expect(pickTimingAction("tradeShippingDays", "deactivate")).toBe(
      "cancel_and_refund",
    );
  });

  it("seçilebilir eylemi okur", async () => {
    const db = settingReader({
      [timingActionSettingKey("listingTtlDays")]: "deactivate",
    });
    await expect(resolveTimingAction(db, "listingTtlDays")).resolves.toBe(
      "deactivate",
    );
    expect(db.platformSetting.findUnique).toHaveBeenCalledWith({
      where: { settingKey: "listing_ttl_days_on_expiry" },
    });
  });
});

describe("loadTimingRuleStates / loadTimingValues", () => {
  it("tüm kayıtları tek sorguda okur, kaynağı ve son güncellemeyi raporlar", async () => {
    const updatedAt = new Date("2026-10-02T08:00:00.000Z");
    const db = listReader(
      { payment_hold_days: "5", unrelated_key: "9" },
      updatedAt,
    );
    const states = await loadTimingRuleStates(
      db,
      envOf({ LISTING_TTL_DAYS: "90" }),
    );

    expect(db.platformSetting.findMany).toHaveBeenCalledTimes(1);
    expect(states.map((s) => s.id)).toEqual(TIMING_RULE_IDS);
    expect(states.find((s) => s.id === "tradeHoldDays")).toEqual({
      id: "tradeHoldDays",
      value: 5,
      source: "setting",
      action: "release_funds",
      updatedAt: updatedAt.toISOString(),
    });
    expect(states.find((s) => s.id === "listingTtlDays")).toMatchObject({
      value: 90,
      source: "env",
      updatedAt: null,
    });
    expect(states.find((s) => s.id === "offerExpiryHours")).toMatchObject({
      value: 24,
      source: "default",
    });
  });

  it("hiç ayar/env yokken değerler kayıt varsayılanlarına eşittir", async () => {
    await expect(loadTimingValues(listReader(), envOf())).resolves.toEqual(
      defaultTimingValues(),
    );
  });
});
