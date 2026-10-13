import {
  DEFAULT_MIN_OFFER_PERCENTAGE,
  resolveMinOfferPercentage,
} from "./offer";

const env = (value?: string) => ({
  get: (key: string) => (key === "MIN_OFFER_PERCENTAGE" ? value : undefined),
});

describe("resolveMinOfferPercentage", () => {
  it("varsayılan %50", () => {
    expect(DEFAULT_MIN_OFFER_PERCENTAGE).toBe(50);
    expect(resolveMinOfferPercentage(env(undefined))).toBe(50);
  });

  it.each([
    ["0", 0],
    ["1", 1],
    ["50", 50],
    ["70", 70],
    ["100", 100],
    [" 65 ", 65],
  ])("geçerli değer %j → %i", (raw, expected) => {
    expect(resolveMinOfferPercentage(env(raw))).toBe(expected);
  });

  // parseInt NaN üretince eski kod alt sınırı hiç uygulamıyordu (her teklif geçerdi).
  it.each(["", "abc", "-5", "101", "1000"])(
    "geçersiz değer %j varsayılana düşer",
    (raw) => {
      expect(resolveMinOfferPercentage(env(raw))).toBe(50);
    },
  );
});

describe("resolveMinOfferPercentage — 0 = alt sınır yok", () => {
  it("0 varsayılana ZORLANMAZ (operatör tabanı kapatabilir)", () => {
    expect(resolveMinOfferPercentage(env("0"))).toBe(0);
  });
});
