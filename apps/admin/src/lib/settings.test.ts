import { describe, expect, it } from "vitest";
import {
  DISTANCE_SALES_CONSENT_REQUIRED_SETTING,
  REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
} from "@tarodan/types";
import { readSettingOn } from "./settings";

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
