import {
  EARCHIVE_CANCELLATION_WINDOW_DAYS,
  eArchiveReversalStrategy,
} from "./earchive-reversal-strategy";

describe("eArchiveReversalStrategy", () => {
  const issued = new Date("2026-06-01T00:00:00Z");

  it("yasal pencere 8 gündür", () => {
    expect(EARCHIVE_CANCELLATION_WINDOW_DAYS).toBe(8);
  });

  it.each([
    ["2026-06-01T00:00:00Z", "CANCEL"], // aynı gün
    ["2026-06-05T00:00:00Z", "CANCEL"], // 4 gün
    ["2026-06-09T00:00:00Z", "CANCEL"], // 8 gün (sınır)
    ["2026-06-09T23:59:59Z", "CANCEL"], // 8 gün + saatler: tam gün sayılır
    ["2026-06-10T00:00:00Z", "RETURN_INVOICE"], // 9 gün
    ["2026-06-12T00:00:00Z", "RETURN_INVOICE"], // 11 gün
  ])("%s → %s", (now, expected) => {
    expect(eArchiveReversalStrategy(issued, new Date(now))).toBe(expected);
  });

  it("ISO metin tarihini de kabul eder", () => {
    expect(
      eArchiveReversalStrategy(
        "2026-06-01T00:00:00Z",
        new Date("2026-06-12T00:00:00Z"),
      ),
    ).toBe("RETURN_INVOICE");
  });
});
