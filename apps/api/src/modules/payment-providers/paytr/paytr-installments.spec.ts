import {
  isPaytrCardFamily,
  isPaytrInstallmentCount,
  parsePaytrInstallmentRates,
  parsePaytrInstallmentCount,
  parsePaytrRate,
  PAYTR_CARD_FAMILIES,
} from "./paytr-installments";
import {
  paytrTaksitOranlariStagingBody,
  PAYTR_STAGING_FAMILIES,
  PAYTR_STAGING_FAMILY_RATES,
  PAYTR_STAGING_SINGLE_RATE_PCT,
} from "../../../../test/fixtures/paytr-taksit-oranlari-staging";

/**
 * The doc shape (family -> count -> rate) with mixed notations; the real
 * answer is the staging capture below. The parser must keep failing closed on
 * anything else.
 */
const DOC_SHAPE_ORANLAR = {
  axess: { taksit_2: "2.83", taksit_3: "3,95", taksit_6: 7.1 },
  world: { "2": "2.90", "3": "4.05" },
  bonus: { taksit_2: "2.85" },
};

describe("PayTR card families", () => {
  it("lists every documented card_type value (Direkt API 1. Adim)", () => {
    expect([...PAYTR_CARD_FAMILIES].sort()).toEqual(
      [
        "advantage",
        "axess",
        "combo",
        "bonus",
        "cardfinans",
        "maximum",
        "paraf",
        "world",
        "saglamkart",
      ].sort(),
    );
  });

  it("rejects 'none' (BIN brand for cards without PayTR installments) and other text", () => {
    expect(isPaytrCardFamily("none")).toBe(false);
    expect(isPaytrCardFamily("AXESS")).toBe(false);
    expect(isPaytrCardFamily(undefined)).toBe(false);
    expect(isPaytrCardFamily("axess")).toBe(true);
  });

  it("accepts only integer installment counts 2-12", () => {
    for (const n of [2, 6, 12]) expect(isPaytrInstallmentCount(n)).toBe(true);
    for (const n of [0, 1, 13, 2.5, Number.NaN, "3"]) {
      expect(isPaytrInstallmentCount(n)).toBe(false);
    }
  });
});

describe("parsePaytrInstallmentRates: staging capture (single_ratio=1, S0)", () => {
  const oranlar = (
    JSON.parse(paytrTaksitOranlariStagingBody()) as { oranlar: unknown }
  ).oranlar;

  it("reads the single-payment rate from oranlar.tumu.tek_cekim", () => {
    expect(parsePaytrInstallmentRates(oranlar).singleRatePct).toBe(
      PAYTR_STAGING_SINGLE_RATE_PCT,
    );
    expect(PAYTR_STAGING_SINGLE_RATE_PCT).toBe("3.46");
  });

  it("parses all nine families, 2-12 each, float noise normalized", () => {
    const { rates } = parsePaytrInstallmentRates(oranlar);
    expect(Object.keys(rates).sort()).toEqual([...PAYTR_CARD_FAMILIES].sort());
    expect([...PAYTR_STAGING_FAMILIES].sort()).toEqual(
      [...PAYTR_CARD_FAMILIES].sort(),
    );
    for (const family of PAYTR_CARD_FAMILIES) {
      expect(rates[family]).toEqual(PAYTR_STAGING_FAMILY_RATES);
    }
    expect(rates.world?.["2"]).toBe("7.43");
    expect(rates.world?.["12"]).toBe("27.8");
  });

  it("ignores nothing and does not read tumu as a card family", () => {
    const { rates, ignored } = parsePaytrInstallmentRates(oranlar);
    expect(ignored).toEqual([]);
    expect(rates).not.toHaveProperty("tumu");
  });
});

describe("parsePaytrInstallmentRates: tumu (all cards)", () => {
  it("reads tek_cekim as a number or a text, case-insensitive keys", () => {
    expect(
      parsePaytrInstallmentRates({ TUMU: { Tek_Cekim: "3,46" } }).singleRatePct,
    ).toBe("3.46");
    expect(
      parsePaytrInstallmentRates({ tumu: { tek_cekim: 0 } }).singleRatePct,
    ).toBe("0");
  });

  it("ignores other keys in tumu: an all-cards row has no family to price", () => {
    const { rates, singleRatePct, ignored } = parsePaytrInstallmentRates({
      tumu: { tek_cekim: 3.46, taksit_2: 7.43 },
    });
    expect(singleRatePct).toBe("3.46");
    expect(rates).toEqual({});
    expect(ignored).toEqual(["oranlar.tumu.taksit_2"]);
  });

  it.each([
    [{ tumu: { tek_cekim: "abc" } }, ["oranlar.tumu.tek_cekim"]],
    [{ tumu: { tek_cekim: 100 } }, ["oranlar.tumu.tek_cekim"]],
    [{ tumu: { tek_cekim: null } }, ["oranlar.tumu.tek_cekim"]],
    [{ tumu: 3.46 }, ["oranlar.tumu"]],
    [{ tumu: [{ tek_cekim: 3.46 }] }, ["oranlar.tumu"]],
    [{ world: { taksit_2: 7.43 } }, []],
  ])("has no single rate for %p (fail closed)", (input, expectedIgnored) => {
    const { singleRatePct, ignored } = parsePaytrInstallmentRates(input);
    expect(singleRatePct).toBeUndefined();
    expect(ignored).toEqual(expectedIgnored);
  });

  it("drops a single rate two entries disagree on, and keeps one given twice alike", () => {
    const conflicted = parsePaytrInstallmentRates([
      { tumu: { tek_cekim: 3.46 } },
      { tumu: { tek_cekim: "3.50" } },
      { tumu: { tek_cekim: 3.46 } },
    ]);
    expect(conflicted.singleRatePct).toBeUndefined();
    expect(conflicted.ignored).toEqual([
      "oranlar[1].tumu.tek_cekim (conflicting rate)",
    ]);

    const same = parsePaytrInstallmentRates([
      { tumu: { tek_cekim: 3.46 } },
      { tumu: { tek_cekim: "3.460" } },
    ]);
    expect(same.singleRatePct).toBe("3.46");
    expect(same.ignored).toEqual([]);
  });

  it("does not read a single rate from a card family row", () => {
    const { singleRatePct, ignored } = parsePaytrInstallmentRates({
      world: { tek_cekim: 3.46 },
    });
    expect(singleRatePct).toBeUndefined();
    expect(ignored).toEqual(["oranlar.world.tek_cekim"]);
  });
});

describe("parsePaytrRate normalization", () => {
  it.each([
    // JSON number literals as PayTR sends them, parsed like the wire.
    ["7.4299999999999997", "7.43"],
    ["9.4700000000000006", "9.47"],
    ["13.550000000000001", "13.55"],
    ["27.800000000000001", "27.8"],
    ["3.46", "3.46"],
  ])("reads the JSON number %s as %p", (literal, expected) => {
    expect(parsePaytrRate(JSON.parse(literal))).toBe(expected);
  });

  it.each([
    ["7.4299999999999997", "7.43"],
    ["7,4299999999999997", "7.43"],
    ["2.0005", "2.001"],
    ["2.0004", "2"],
    ["12.345", "12.345"],
    ["2.90", "2.90"],
  ])(
    "rounds a text finer than 3 decimals half up: %p -> %p",
    (raw, expected) => {
      expect(parsePaytrRate(raw)).toBe(expected);
    },
  );

  it("rounds a computed float to 3 decimals", () => {
    expect(parsePaytrRate(0.1 + 0.2)).toBe("0.3");
  });

  it("rejects a value that rounds to 100", () => {
    expect(parsePaytrRate("99.9996")).toBeNull();
    expect(parsePaytrRate("99.9994")).toBe("99.999");
  });
});

describe("parsePaytrInstallmentRates", () => {
  it("normalizes the doc shape into family -> count -> dot-decimal rate", () => {
    const { rates, ignored } = parsePaytrInstallmentRates(DOC_SHAPE_ORANLAR);
    expect(rates).toEqual({
      axess: { "2": "2.83", "3": "3.95", "6": "7.1" },
      world: { "2": "2.90", "3": "4.05" },
      bonus: { "2": "2.85" },
    });
    expect(ignored).toEqual([]);
  });

  it("keeps the rate text as published (no float rounding)", () => {
    const { rates } = parsePaytrInstallmentRates({
      paraf: { taksit_9: "12.345" },
    });
    expect(rates.paraf?.["9"]).toBe("12.345");
  });

  it("lower-cases family keys and accepts '<n>_taksit' keys", () => {
    const { rates } = parsePaytrInstallmentRates({
      Maximum: { "4_taksit": "5.5" },
    });
    expect(rates).toEqual({ maximum: { "4": "5.5" } });
  });

  it("merges an array of family objects and family arrays of count objects", () => {
    const { rates, ignored } = parsePaytrInstallmentRates([
      { axess: [{ taksit_2: "2.8" }, { taksit_3: "3.9" }] },
      { combo: { taksit_2: "2.7" } },
    ]);
    expect(rates).toEqual({
      axess: { "2": "2.8", "3": "3.9" },
      combo: { "2": "2.7" },
    });
    expect(ignored).toEqual([]);
  });

  it("ignores unknown families and keys without throwing", () => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      axess: { taksit_2: "2.8", taksit_13: "20", note: "x", taksit_3: null },
      troy: { taksit_2: "2.0" },
      updated_at: "2026-11-03",
    });
    expect(rates).toEqual({ axess: { "2": "2.8" } });
    expect(ignored.sort()).toEqual(
      [
        "oranlar.axess.taksit_13",
        "oranlar.axess.note",
        "oranlar.axess.taksit_3",
        "oranlar.troy",
        "oranlar.updated_at",
      ].sort(),
    );
  });

  it("ignores a plain list of numbers (index base is ambiguous)", () => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      bonus: [2.8, 3.9, 5.1],
    });
    expect(rates).toEqual({});
    expect(ignored).toEqual([
      "oranlar.bonus[0]",
      "oranlar.bonus[1]",
      "oranlar.bonus[2]",
    ]);
  });

  it.each([
    ["-1"],
    ["abc"],
    ["100"],
    ["1e-3"],
    [Number.POSITIVE_INFINITY],
    [true],
  ])("ignores a rate that is not a decimal in [0, 100): %p", (bad) => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      axess: { taksit_2: bad },
    });
    expect(rates).toEqual({});
    expect(ignored).toEqual(["oranlar.axess.taksit_2"]);
  });

  it("drops a count two entries disagree on (fail closed)", () => {
    const { rates, ignored } = parsePaytrInstallmentRates([
      { world: { taksit_2: "2.9", taksit_3: "4.0" } },
      { world: { "2": "3.1", "3": "4.0" } },
    ]);
    expect(rates).toEqual({ world: { "3": "4.0" } });
    expect(ignored).toEqual(["oranlar[1].world.2 (conflicting rate)"]);
  });

  it("treats the same rate in two notations as one rate, not a conflict", () => {
    const { rates, ignored } = parsePaytrInstallmentRates([
      { world: { taksit_2: 2.8 } },
      { world: { taksit_2: "2.80" } },
    ]);
    expect(rates).toEqual({ world: { "2": "2.8" } });
    expect(ignored).toEqual([]);
  });

  it("ignores count 0 and keeps count 1 when PayTR lists it", () => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      axess: { taksit_0: "0", taksit_1: "1.5", taksit_12: "21.9" },
    });
    expect(rates).toEqual({ axess: { "1": "1.5", "12": "21.9" } });
    expect(ignored).toEqual(["oranlar.axess.taksit_0"]);
  });

  it.each([
    ["taksit-2", "2"],
    ["taksit2", "2"],
    ["2-taksit", "2"],
    ["TAKSIT_3", "3"],
    ["02", "2"],
  ])("reads the count key %p as count %p", (key, count) => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      bonus: { [key]: "2.5" },
    });
    expect(rates).toEqual({ bonus: { [count]: "2.5" } });
    expect(ignored).toEqual([]);
  });

  it.each([
    ["0", "0"],
    ["0.0", "0.0"],
    ["99.99", "99.99"],
    [" 4,25 ", "4.25"],
    [0, "0"],
  ])("keeps the boundary rate %p as %p", (raw, expected) => {
    const { rates, ignored } = parsePaytrInstallmentRates({
      combo: { taksit_2: raw },
    });
    expect(rates).toEqual({ combo: { "2": expected } });
    expect(ignored).toEqual([]);
  });

  it("does not let a third entry bring back a conflicted count", () => {
    const { rates } = parsePaytrInstallmentRates([
      { world: { taksit_2: "2.9" } },
      { world: { taksit_2: "3.1" } },
      { world: { taksit_2: "2.9" } },
    ]);
    expect(rates).toEqual({});
  });

  it("ignores prototype keys from a JSON answer", () => {
    const { rates, ignored } = parsePaytrInstallmentRates(
      JSON.parse(
        '{"__proto__":{"taksit_2":"1"},"axess":{"__proto__":"1","taksit_2":"2.8"}}',
      ),
    );
    expect(rates).toEqual({ axess: { "2": "2.8" } });
    expect(ignored.sort()).toEqual(
      ["oranlar.__proto__", "oranlar.axess.__proto__"].sort(),
    );
    expect(({} as Record<string, unknown>).taksit_2).toBeUndefined();
  });

  it.each([[undefined], [null], ["[]"], [42]])(
    "returns an empty table for a missing or scalar oranlar: %p",
    (value) => {
      const { rates, ignored } = parsePaytrInstallmentRates(value);
      expect(rates).toEqual({});
      expect(ignored).toEqual(["oranlar"]);
    },
  );
});

describe("parsePaytrInstallmentCount", () => {
  it.each([
    ["0", 0],
    [" 3 ", 3],
    ["-1", undefined],
    ["2x", undefined],
    [true, undefined],
    ["9", 9],
    [12, 12],
    [0, 0],
    ["13", undefined],
    ["", undefined],
    ["6.5", undefined],
    [null, undefined],
    // Boundaries and number inputs: 1 is a single payment PayTR may report,
    // 2 and 12 are the installment range ends.
    ["1", 1],
    ["2", 2],
    ["12", 12],
    [13, undefined],
    [2.5, undefined],
    [-1, undefined],
    [Number.NaN, undefined],
    ["012", undefined],
    [undefined, undefined],
  ])("count %p -> %p", (raw, expected) => {
    expect(parsePaytrInstallmentCount(raw)).toBe(expected);
  });
});
