import { describe, expect, it } from "vitest";
import { paytrOidDisplay } from "./paytr-oid";

describe("paytrOidDisplay", () => {
  it("returns the current id and the previous attempts", () => {
    expect(
      paytrOidDisplay({
        paytrOid: "GRPDBN4NPYYTZT790149",
        paytrOidHistory: ["GRPDBN4NPYYTZT790100"],
      }),
    ).toEqual({
      current: "GRPDBN4NPYYTZT790149",
      previous: ["GRPDBN4NPYYTZT790100"],
    });
  });

  it("returns null when there is nothing to show", () => {
    expect(paytrOidDisplay(null)).toBeNull();
    expect(paytrOidDisplay(undefined)).toBeNull();
    expect(paytrOidDisplay({})).toBeNull();
    expect(
      paytrOidDisplay({ paytrOid: "  ", paytrOidHistory: ["", " "] }),
    ).toBeNull();
  });

  it("still shows earlier attempts when the current id is missing", () => {
    expect(paytrOidDisplay({ paytrOidHistory: ["A"] })).toEqual({
      current: null,
      previous: ["A"],
    });
  });

  it("never repeats the current id among the previous attempts", () => {
    expect(
      paytrOidDisplay({ paytrOid: "A", paytrOidHistory: ["A", "B"] }),
    ).toEqual({ current: "A", previous: ["B"] });
  });
});
