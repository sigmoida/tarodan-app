import { analyticsRangeIssue } from "@tarodan/types";
import {
  readRangeParams,
  toRangeQuery,
  writeRangeParams,
} from "./rangeParams";

const today = new Date("2026-06-15T12:00:00");

describe("readRangeParams", () => {
  it("boş URL'de son 30 güne açılır", () => {
    expect(readRangeParams(new URLSearchParams(), today)).toEqual({
      from: "2026-05-17",
      to: "2026-06-15",
      groupBy: "day",
      compare: false,
    });
  });

  it("URL'deki seçimi okur", () => {
    expect(
      readRangeParams(
        new URLSearchParams(
          "from=2026-01-01&to=2026-03-31&groupBy=month&compare=1",
        ),
        today,
      ),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
      groupBy: "month",
      compare: true,
    });
  });

  it("tanınmayan gruplamayı varsayılana düşürür", () => {
    expect(
      readRangeParams(new URLSearchParams("groupBy=quarter"), today).groupBy,
    ).toBe("day");
  });

  /** Okunan seçim HER ZAMAN API'nin kabul edeceği bir aralık olmalı. */
  it("her zaman geçerli bir aralık üretir", () => {
    for (const query of ["", "from=2026-06-01", "to=2026-06-01", "groupBy=x"]) {
      expect(
        analyticsRangeIssue(readRangeParams(new URLSearchParams(query), today)),
      ).toBeNull();
    }
  });
});

describe("writeRangeParams", () => {
  const base = readRangeParams(new URLSearchParams(), today);

  it("varsayılan seçimde URL'i temiz bırakır", () => {
    expect(
      writeRangeParams(new URLSearchParams(), base, today).toString(),
    ).toBe("");
  });

  it("varsayılan olmayan seçimi yazar", () => {
    const params = writeRangeParams(
      new URLSearchParams(),
      { from: "2026-01-01", to: "2026-03-31", groupBy: "week", compare: true },
      today,
    );

    expect(params.get("from")).toBe("2026-01-01");
    expect(params.get("to")).toBe("2026-03-31");
    expect(params.get("groupBy")).toBe("week");
    expect(params.get("compare")).toBe("1");
  });

  /** Aktif sekme de aynı URL'de yaşıyor; filtre onu düşürmemeli. */
  it("diğer sorgu parametrelerini korur", () => {
    expect(
      writeRangeParams(new URLSearchParams("tab=quality"), base, today).get(
        "tab",
      ),
    ).toBe("quality");
  });

  it("karşılaştırma kapatıldığında parametreyi siler", () => {
    expect(
      writeRangeParams(
        new URLSearchParams("compare=1"),
        { ...base, compare: false },
        today,
      ).has("compare"),
    ).toBe(false);
  });
});

describe("toRangeQuery", () => {
  /**
   * Ölçülmemiş karşılaştırma NULL dönmeli; `compare=false` göndermek yerine
   * parametreyi hiç göndermemek sunucudaki önbellek anahtarını da ayırır.
   */
  it("karşılaştırma istenmedikçe bayrağı göndermez", () => {
    const query = toRangeQuery({
      from: "2026-06-01",
      to: "2026-06-30",
      groupBy: "day",
      compare: false,
    });

    expect(query).not.toHaveProperty("compare");
  });

  it("istendiğinde bayrağı gönderir", () => {
    expect(
      toRangeQuery({
        from: "2026-06-01",
        to: "2026-06-30",
        groupBy: "day",
        compare: true,
      }).compare,
    ).toBe(true);
  });
});
