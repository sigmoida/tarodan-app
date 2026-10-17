import { describe, expect, it } from "vitest";
import { readDistanceSalesConsentRequired } from "./settings";

describe("readDistanceSalesConsentRequired", () => {
  it("ayar yoksa kapalıdır (eski mobil sürümler ödeyebilsin)", () => {
    expect(readDistanceSalesConsentRequired([])).toBe(false);
  });

  it("yalnız 'true' açık sayılır — iki yanıt şekli de okunur", () => {
    expect(
      readDistanceSalesConsentRequired([
        {
          settingKey: "distance_sales_consent_required",
          settingValue: "true",
        },
      ]),
    ).toBe(true);
    expect(
      readDistanceSalesConsentRequired({
        distance_sales_consent_required: "false",
      }),
    ).toBe(false);
    expect(
      readDistanceSalesConsentRequired({
        distance_sales_consent_required: "1",
      }),
    ).toBe(false);
  });
});
