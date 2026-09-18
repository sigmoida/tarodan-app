import {
  readPeriodParams,
  toDateInputValue,
  toPeriodQuery,
  writePeriodParams,
} from "./periodParams";

const today = new Date(2026, 8, 18); // 18 Sep 2026, local

describe("readPeriodParams", () => {
  it("defaults to the daily period", () => {
    expect(readPeriodParams(new URLSearchParams(), today)).toEqual({
      period: "daily",
      from: "2026-09-18",
      to: "2026-09-18",
    });
  });

  it("ignores an unknown period", () => {
    expect(
      readPeriodParams(new URLSearchParams("period=weekly"), today).period,
    ).toBe("daily");
  });

  it("reads a custom range", () => {
    expect(
      readPeriodParams(
        new URLSearchParams("period=custom&from=2026-01-01&to=2026-01-31"),
        today,
      ),
    ).toEqual({ period: "custom", from: "2026-01-01", to: "2026-01-31" });
  });

  it("opens a dateless custom period on today", () => {
    expect(
      readPeriodParams(new URLSearchParams("period=custom"), today),
    ).toEqual({ period: "custom", from: "2026-09-18", to: "2026-09-18" });
  });
});

describe("writePeriodParams", () => {
  it("keeps the default period out of the URL", () => {
    const params = writePeriodParams(new URLSearchParams("period=monthly"), {
      period: "daily",
      from: "2026-09-18",
      to: "2026-09-18",
    });
    expect(params.toString()).toBe("");
  });

  it("drops a stale range when leaving the custom period", () => {
    const params = writePeriodParams(
      new URLSearchParams("period=custom&from=2026-01-01&to=2026-01-31"),
      { period: "monthly", from: "2026-01-01", to: "2026-01-31" },
    );
    expect(params.toString()).toBe("period=monthly");
  });

  it("writes both ends of a custom range", () => {
    const params = writePeriodParams(new URLSearchParams(), {
      period: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(params.get("period")).toBe("custom");
    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-01-31");
  });

  it("leaves unrelated params alone", () => {
    const params = writePeriodParams(new URLSearchParams("tab=sales"), {
      period: "monthly",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(params.get("tab")).toBe("sales");
  });
});

describe("toPeriodQuery", () => {
  it("sends no dates for a non-custom period", () => {
    expect(
      toPeriodQuery({
        period: "monthly",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toEqual({ period: "monthly" });
  });

  it("sends both dates for a custom period", () => {
    expect(
      toPeriodQuery({ period: "custom", from: "2026-01-01", to: "2026-01-31" }),
    ).toEqual({ period: "custom", from: "2026-01-01", to: "2026-01-31" });
  });
});

describe("toDateInputValue", () => {
  it("formats in local time, zero-padded", () => {
    expect(toDateInputValue(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
