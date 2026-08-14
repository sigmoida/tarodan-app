import { describe, it, expect } from "vitest";
import {
  formatPhoneNumber,
  combinePhone,
  splitPhone,
  toStoredPhone,
} from "@/lib/phone";

/**
 * The phone helpers had no tests, which is how a swapped-argument call
 * (`getFullPhoneNumber(countryCode, phone)`) shipped and silently broke SMS
 * verification for every user. The country-code parameter is gone now, so these
 * lock in the remaining contract: only Turkish mobiles get through, in one
 * canonical shape, whichever way the user typed or pasted them.
 */

describe("formatPhoneNumber", () => {
  it("masks a national number as 5XX XXX XX XX", () => {
    expect(formatPhoneNumber("5300665841")).toBe("530 066 58 41");
  });

  it("masks progressively while typing", () => {
    expect(formatPhoneNumber("53")).toBe("53");
    expect(formatPhoneNumber("5300")).toBe("530 0");
    expect(formatPhoneNumber("5300665")).toBe("530 066 5");
  });

  it("normalizes the prefixes users actually paste", () => {
    expect(formatPhoneNumber("+90 530 066 58 41")).toBe("530 066 58 41");
    expect(formatPhoneNumber("0530 066 58 41")).toBe("530 066 58 41");
    expect(formatPhoneNumber("905300665841")).toBe("530 066 58 41");
  });

  it("drops digits that cannot begin a Turkish mobile", () => {
    // Landline (312…), foreign (447…) — the field never holds them.
    expect(formatPhoneNumber("3121234567")).toBe("");
    expect(formatPhoneNumber("+447700900123")).toBe("");
  });

  it("caps at ten digits", () => {
    expect(formatPhoneNumber("53006658419999")).toBe("530 066 58 41");
  });
});

describe("combinePhone", () => {
  it("builds the stored form from the national part", () => {
    expect(combinePhone("530 066 58 41")).toBe("+905300665841");
  });

  it("accepts an already-stored value (saved addresses round-trip)", () => {
    expect(combinePhone("+905300665841")).toBe("+905300665841");
    expect(combinePhone("05300665841")).toBe("+905300665841");
  });

  it("returns empty for incomplete or non-Turkish input", () => {
    expect(combinePhone("530 066 58")).toBe("");
    expect(combinePhone("+447700900123")).toBe("");
    expect(combinePhone("3121234567")).toBe("");
    expect(combinePhone("")).toBe("");
    expect(combinePhone(undefined)).toBe("");
  });

  it("is the submit gate — an invalid number is falsy, never a bare dial code", () => {
    expect(combinePhone("5")).toBe("");
  });
});

describe("splitPhone", () => {
  it("splits a stored value into the masked national part", () => {
    expect(splitPhone("+905300665841")).toEqual({
      national: "530 066 58 41",
      isLegacy: false,
    });
  });

  it("treats empty as empty, not legacy", () => {
    expect(splitPhone("")).toEqual({ national: "", isLegacy: false });
    expect(splitPhone(undefined)).toEqual({ national: "", isLegacy: false });
  });

  it("flags pre-rule rows so the UI can ask for a new number", () => {
    // Registration accepted any string before the Turkey-only rule.
    expect(splitPhone("+447700900123")).toEqual({
      national: "",
      isLegacy: true,
    });
    expect(splitPhone("0212 555 44 33")).toEqual({
      national: "",
      isLegacy: true,
    });
  });

  it("renders a half-typed value instead of calling it legacy", () => {
    // A controlled PhoneInput reads its value back through here after every
    // keystroke; treating "+90530" as legacy blanked the field, so the user
    // could not type at all.
    expect(splitPhone("+90530")).toEqual({
      national: "530",
      isLegacy: false,
    });
    expect(splitPhone("+90")).toEqual({ national: "", isLegacy: false });
    expect(splitPhone("+90212")).toEqual({ national: "", isLegacy: true });
  });

  it("round-trips with combinePhone", () => {
    const stored = "+905300665841";
    expect(combinePhone(splitPhone(stored).national)).toBe(stored);
  });
});

describe("toStoredPhone", () => {
  it("keeps what has been typed so far", () => {
    expect(toStoredPhone("5")).toBe("+905");
    expect(toStoredPhone("530 066")).toBe("+90530066");
  });

  it("matches combinePhone once the number is complete", () => {
    expect(toStoredPhone("530 066 58 41")).toBe(combinePhone("530 066 58 41"));
  });

  it("stores nothing when there are no digits to keep", () => {
    expect(toStoredPhone("")).toBe("");
    // Not a Turkish mobile prefix — the formatter drops it.
    expect(toStoredPhone("212")).toBe("");
  });

  it("survives a round trip through the field", () => {
    expect(splitPhone(toStoredPhone("530 0")).national).toBe("530 0");
  });
});
