/** @format */

import { describe, expect, it } from "vitest";
import { PROFILE_GATE_SECTION, profileGateHref } from "./profileGate";

describe("profileGateHref", () => {
  it("IBAN kapısı: returnTo + banka bölümü anchor'ı", () => {
    expect(profileGateHref("bank", "/listings/new")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew#bank-account",
    );
  });

  it("adres kapısı: returnTo + adres bölümü anchor'ı", () => {
    expect(profileGateHref("address", "/listings/new")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew#addresses",
    );
  });

  it("anchor, bölümlerin kullandığı id sabitiyle aynıdır", () => {
    expect(
      profileGateHref("bank", "/x").endsWith(`#${PROFILE_GATE_SECTION.bank}`),
    ).toBe(true);
    expect(
      profileGateHref("address", "/x").endsWith(
        `#${PROFILE_GATE_SECTION.address}`,
      ),
    ).toBe(true);
  });
});
