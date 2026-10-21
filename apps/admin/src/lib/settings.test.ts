import { describe, expect, it } from "vitest";
import {
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
  REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
} from "@tarodan/types";
import {
  readBoostEnabled,
  readBoostOfferSince,
  readSettingOn,
} from "./settings";

describe("readSettingOn", () => {
  it.each([
    DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
    REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
  ])("is off when %s is missing (older mobile builds keep working)", (key) => {
    expect(readSettingOn([], key)).toBe(false);
    expect(readSettingOn({}, key)).toBe(false);
  });

  it("is on only for 'true', in both response shapes", () => {
    const key = REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING;
    expect(
      readSettingOn([{ settingKey: key, settingValue: "true" }], key),
    ).toBe(true);
    expect(readSettingOn({ [key]: " TRUE " }, key)).toBe(true);
    expect(readSettingOn({ [key]: "false" }, key)).toBe(false);
    expect(readSettingOn({ [key]: "1" }, key)).toBe(false);
  });

  it("reads only its own key", () => {
    expect(
      readSettingOn(
        { [DISTANCE_SALES_CONSENT_REQUIRED_SETTING]: "true" },
        REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
      ),
    ).toBe(false);
  });
});

describe("readBoostEnabled", () => {
  it("is on when boost_enabled is missing or empty (unlike readSettingOn)", () => {
    expect(readBoostEnabled([])).toBe(true);
    expect(readBoostEnabled({})).toBe(true);
    expect(readBoostEnabled({ boost_enabled: "" })).toBe(true);
    expect(readSettingOn({}, "boost_enabled")).toBe(false);
  });

  it("is off only for 'false', in both response shapes", () => {
    expect(
      readBoostEnabled([
        { settingKey: "boost_enabled", settingValue: "false" },
      ]),
    ).toBe(false);
    expect(readBoostEnabled({ boost_enabled: " False " })).toBe(false);
    expect(readBoostEnabled({ boost_enabled: "true" })).toBe(true);
    expect(readBoostEnabled({ boost_enabled: "0" })).toBe(true);
  });
});

describe("readBoostOfferSince", () => {
  it("reads a date and treats missing, empty or invalid as off", () => {
    expect(
      readBoostOfferSince({
        boost_offer_since: "2026-11-01T00:00:00.000+03:00",
      })?.toISOString(),
    ).toBe("2026-10-31T21:00:00.000Z");
    expect(readBoostOfferSince({})).toBeNull();
    expect(readBoostOfferSince({ boost_offer_since: " " })).toBeNull();
    expect(readBoostOfferSince({ boost_offer_since: "soon" })).toBeNull();
  });
});
