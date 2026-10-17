import { describe, expect, it } from "vitest";

import { taxonomyFilterFields } from "./taxonomyFilters";

const t = ((key: string) => key) as unknown as Parameters<
  typeof taxonomyFilterFields
>[0];

describe("taxonomyFilterFields", () => {
  const fields = taxonomyFilterFields(t, "ALL");

  it("marka/üretici listesine durum ve ilan var/yok filtresini verir", () => {
    expect(fields.map((f) => ("name" in f ? f.name : null))).toEqual([
      "status",
      "hasListings",
    ]);
  });

  it("durum filtresi çağıranın 'tümü' etiketiyle başlar", () => {
    const status = fields[0];
    expect(status.type === "select" && status.options[0]).toEqual({
      value: "all",
      label: "ALL",
    });
  });

  it("hasListings, API'nin beklediği true/false değerlerini gönderir", () => {
    const has = fields[1];
    expect(has.type === "select" && has.options.map((o) => o.value)).toEqual([
      "all",
      "true",
      "false",
    ]);
  });
});
