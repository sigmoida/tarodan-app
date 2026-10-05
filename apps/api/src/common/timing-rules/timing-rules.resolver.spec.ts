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
    findUnique: jest.fn(async ({ where }: { where: { settingKey: string } }) =>
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

/** Süreler ve Kurallar ucunun yazdığı satır (updatedBy dolu). */
const adminRow = (settingValue: string) => ({
  settingValue,
  updatedBy: "user-1",
});
/** Bu ekrandan önce yazılmış eski satır (seed / eski genel ayar ucu). */
const legacyRow = (settingValue: string) => ({ settingValue, updatedBy: null });

describe("pickTimingValue — çözüm sırası: ayar → env → varsayılan", () => {
  it("admin satırı env'i ve varsayılanı ezer", () => {
    expect(
      pickTimingValue(
        "returnWindowDays",
        adminRow("21"),
        envOf({ RETURN_WINDOW_DAYS: "30" }),
      ),
    ).toEqual({ value: 21, source: "setting", outOfBounds: false });
  });

  it("ayar yoksa eski env değişkenine düşer", () => {
    expect(
      pickTimingValue(
        "returnWindowDays",
        undefined,
        envOf({ RETURN_WINDOW_DAYS: "30" }),
      ),
    ).toEqual({ value: 30, source: "env", outOfBounds: false });
  });

  it("ayar da env de yoksa kayıt varsayılanı", () => {
    expect(pickTimingValue("returnWindowDays", undefined, envOf())).toEqual({
      value: 14,
      source: "default",
      outOfBounds: false,
    });
  });

  it("geçersiz ayar env'e, geçersiz env varsayılana düşer", () => {
    expect(
      pickTimingValue(
        "offerExpiryHours",
        adminRow("0"),
        envOf({ OFFER_EXPIRY_HOURS: "48" }),
      ),
    ).toMatchObject({ value: 48, source: "env" });
    expect(
      pickTimingValue(
        "offerExpiryHours",
        adminRow("abc"),
        envOf({ OFFER_EXPIRY_HOURS: "sıfır" }),
      ),
    ).toMatchObject({ value: 24, source: "default" });
  });

  it("env'i olmayan kayıt (takas) env'e hiç bakmaz", () => {
    const env = { get: jest.fn() };
    expect(pickTimingValue("tradeResponseHours", undefined, env)).toMatchObject(
      { value: 72, source: "default" },
    );
    expect(env.get).not.toHaveBeenCalled();
  });

  describe("eski (updatedBy null) satır env'in önüne geçmez", () => {
    it("seed'deki offer_expiry_hours=24, env OFFER_EXPIRY_HOURS=48 iken env kazanır (deploy davranış değiştirmez)", () => {
      expect(
        pickTimingValue(
          "offerExpiryHours",
          legacyRow("24"),
          envOf({ OFFER_EXPIRY_HOURS: "48" }),
        ),
      ).toEqual({ value: 48, source: "env", outOfBounds: false });
    });

    it("env yoksa eski satır varsayılandan önce gelir", () => {
      expect(
        pickTimingValue("offerExpiryHours", legacyRow("36"), envOf()),
      ).toMatchObject({ value: 36, source: "setting" });
    });

    it("env'i olmayan kayıtta (payment_hold_days, takas) eski satır eskisi gibi okunur", () => {
      expect(
        pickTimingValue("tradeHoldDays", legacyRow("5"), envOf()),
      ).toMatchObject({ value: 5, source: "setting" });
      expect(
        pickTimingValue("tradeResponseHours", legacyRow("96"), envOf()),
      ).toMatchObject({ value: 96, source: "setting" });
    });

    it("ekranın yazdığı satır env'i her zaman ezer", () => {
      expect(
        pickTimingValue(
          "offerExpiryHours",
          adminRow("12"),
          envOf({ OFFER_EXPIRY_HOURS: "48" }),
        ),
      ).toMatchObject({ value: 12, source: "setting" });
    });
  });

  describe("sınır dışı değerler", () => {
    it("env'deki eski değer admin sınırlarının dışında olsa da bugünkü gibi uygulanır ama işaretlenir", () => {
      // Admin en az 14 gün kaydedebilir; bugün env'de 7 yazan bir kurulum
      // deploy ile sessizce 14'e çıkmamalı — ama ekranda uyarı görmeli.
      expect(
        pickTimingValue(
          "returnWindowDays",
          undefined,
          envOf({ RETURN_WINDOW_DAYS: "7" }),
        ),
      ).toEqual({ value: 7, source: "env", outOfBounds: true });
    });

    it("üst sınırı aşan eski satır da işaretlenir", () => {
      expect(
        pickTimingValue("tradeResponseHours", legacyRow("500"), envOf()),
      ).toEqual({ value: 500, source: "setting", outOfBounds: true });
    });

    it("akışı çökertecek değer (0, eksi) hiçbir katmandan üretilmez", () => {
      expect(
        pickTimingValue(
          "payoutGraceDays",
          adminRow("0"),
          envOf({ PAYOUT_GRACE_DAYS: "-2" }),
        ),
      ).toEqual({ value: 1, source: "default", outOfBounds: false });
    });
  });
});

describe("resolveTimingValue", () => {
  it("kaydın ayar anahtarını okur ve sırayı uygular", async () => {
    const db = settingReader({ trade_shipping_deadline_days: "10" });
    await expect(resolveTimingValue(db, "tradeShippingDays")).resolves.toBe(10);
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
    expect(pickTimingAction("offerExpiryHours", "extend_once")).toBe("expire");
  });

  it("kayıtta tanımsız eylem varsayılana düşer", () => {
    expect(pickTimingAction("tradeShippingDays", "deactivate")).toBe(
      "cancel_and_refund",
    );
  });

  it("ilan ömrü için otomatik yenileme seçilebilir ve okunur", async () => {
    expect(pickTimingAction("listingTtlDays", "auto_renew")).toBe("auto_renew");
    await expect(
      resolveTimingAction(
        settingReader({
          [timingActionSettingKey("listingTtlDays")]: "auto_renew",
        }),
        "listingTtlDays",
      ),
    ).resolves.toBe("auto_renew");
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
      outOfBounds: false,
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
