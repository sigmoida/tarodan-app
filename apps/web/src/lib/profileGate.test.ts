/** @format */

import { describe, expect, it } from "vitest";
import {
  PROFILE_GATE,
  gateReturnTarget,
  parseGateReturnTo,
  profileGateHref,
} from "./profileGate";

describe("profileGateHref", () => {
  it("IBAN kapısı: returnTo + gate=bank + banka bölümü anchor'ı", () => {
    expect(profileGateHref("bank", "/listings/new")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew&gate=bank#bank-account",
    );
  });

  it("adres kapısı: returnTo + gate=address + adres bölümü anchor'ı", () => {
    expect(profileGateHref("address", "/listings/new")).toBe(
      "/profile?returnTo=%2Flistings%2Fnew&gate=address#addresses",
    );
  });

  it("returnTo yoksa düz bölüm linki", () => {
    expect(profileGateHref("address", null)).toBe("/profile#addresses");
  });

  it("anchor, bölümlerin kullandığı id sabitiyle aynıdır", () => {
    expect(
      profileGateHref("bank", "/x").endsWith(`#${PROFILE_GATE.bank.anchor}`),
    ).toBe(true);
    expect(
      profileGateHref("address", "/x").endsWith(
        `#${PROFILE_GATE.address.anchor}`,
      ),
    ).toBe(true);
  });
});

describe("parseGateReturnTo", () => {
  it("yalnız kendi kapısından gelince returnTo verir", () => {
    const search = new URL(
      profileGateHref("bank", "/listings/new"),
      "https://x.test",
    ).search;
    expect(parseGateReturnTo(search, "bank")).toBe("/listings/new");
    expect(parseGateReturnTo(search, "address")).toBeNull();
  });

  it("gate yoksa (başka kaynaktan returnTo) dönmez", () => {
    expect(parseGateReturnTo("?returnTo=%2Flistings%2Fnew", "bank")).toBeNull();
  });

  it("güvensiz returnTo'yu reddeder", () => {
    expect(
      parseGateReturnTo("?returnTo=%2F%2Fevil.com&gate=bank", "bank"),
    ).toBeNull();
  });

  it("locale önekini atar", () => {
    expect(
      parseGateReturnTo("?returnTo=%2Fen%2Flistings%2Fnew&gate=bank", "bank"),
    ).toBe("/listings/new");
  });
});

describe("PROFILE_GATE.isOpen", () => {
  it("banka: kayıt varsa açık", () => {
    expect(PROFILE_GATE.bank.isOpen({ iban: "TR1" })).toBe(true);
    expect(PROFILE_GATE.bank.isOpen(null)).toBe(false);
    expect(PROFILE_GATE.bank.isOpen(undefined)).toBe(false);
  });

  it("adres: yalnız varsayılan/ilk adres kullanılabilirse açık", () => {
    const ok = {
      id: "1",
      phone: "+905321234567",
      city: "İstanbul",
      district: "Kadıköy",
      address: "Bir sokak 1",
    };
    expect(PROFILE_GATE.address.isOpen([ok])).toBe(true);
    expect(PROFILE_GATE.address.isOpen([])).toBe(false);
    expect(PROFILE_GATE.address.isOpen(undefined)).toBe(false);
    expect(
      PROFILE_GATE.address.isOpen([{ ...ok, phone: "+902121234567" }]),
    ).toBe(false);
  });
});

describe("gateReturnTarget", () => {
  it("mevcut sayfayı döner", () => {
    expect(gateReturnTarget("/listings/42")).toBe("/listings/42");
  });

  it("akış sayfalarında ve geçersizde null", () => {
    expect(gateReturnTarget("/checkout")).toBeNull();
    expect(gateReturnTarget("/payment/9")).toBeNull();
    expect(gateReturnTarget("/membership/checkout")).toBeNull();
    expect(gateReturnTarget(null)).toBeNull();
    expect(gateReturnTarget("//evil.com")).toBeNull();
  });
});
