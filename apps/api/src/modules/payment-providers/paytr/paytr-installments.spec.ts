import {
  isPaytrCardFamily,
  isPaytrInstallmentCount,
  parsePaytrInstallmentRates,
  parsePaytrMaxInstallment,
  PAYTR_CARD_FAMILIES,
} from "./paytr-installments";

/**
 * `taksit-oranlari` documents `oranlar` only as "rates per installment
 * count, grouped by card family" (https://dev.paytr.com/direkt-api/taksit-sorgulama).
 * FIXTURE: the shape below is the doc shape (family -> count -> rate), not a
 * captured answer. Swap it for the redacted staging capture (hub plan task
 * S0) once it exists; the parser must keep failing closed on anything else.
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

  it.each([[undefined], [null], ["[]"], [42]])(
    "returns an empty table for a missing or scalar oranlar: %p",
    (value) => {
      const { rates, ignored } = parsePaytrInstallmentRates(value);
      expect(rates).toEqual({});
      expect(ignored).toEqual(["oranlar"]);
    },
  );
});

describe("parsePaytrMaxInstallment", () => {
  it.each([
    ["9", 9],
    [12, 12],
    [0, 0],
    ["13", undefined],
    ["", undefined],
    ["6.5", undefined],
    [null, undefined],
  ])("max_inst_non_bus %p -> %p", (raw, expected) => {
    expect(parsePaytrMaxInstallment(raw)).toBe(expected);
  });
});
