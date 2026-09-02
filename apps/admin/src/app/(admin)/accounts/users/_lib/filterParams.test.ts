import { describe, expect, it } from "vitest";
import { accountStatusParams, isAccountStatus } from "./types";

describe("accountStatusParams", () => {
  it("geçerli durum sekmesini getUsers parametresine çevirir", () => {
    expect(accountStatusParams("pending_activation")).toEqual({
      accountStatus: "pending_activation",
    });
    expect(accountStatusParams("deleted")).toEqual({
      accountStatus: "deleted",
    });
  });

  it("bilinmeyen/boş değer filtre göndermez (sunucu varsayılanı: silinmişler gizli)", () => {
    expect(accountStatusParams("ai")).toEqual({});
    expect(accountStatusParams("all")).toEqual({});
    expect(accountStatusParams(undefined)).toEqual({});
  });
});

describe("isAccountStatus", () => {
  it("yalnız türetilmiş hesap durumlarını kabul eder", () => {
    expect(isAccountStatus("banned")).toBe(true);
    expect(isAccountStatus("ai")).toBe(false);
  });
});
