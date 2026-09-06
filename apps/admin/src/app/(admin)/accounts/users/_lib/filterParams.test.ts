import { describe, expect, it } from "vitest";
import { loginStateWhere } from "@tarodan/types";
import {
  accountStatusParams,
  isAccountStatus,
  loginStateParams,
} from "./types";

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

describe("loginStateParams", () => {
  it("'hiç giriş yapmadı' seçimini sorguya geçirir", () => {
    expect(loginStateParams("never")).toEqual({ loginState: "never" });
    expect(loginStateParams("logged_in")).toEqual({ loginState: "logged_in" });
  });

  it("'all' ve boş değer filtre göndermez", () => {
    expect(loginStateParams("all")).toEqual({});
    expect(loginStateParams(undefined)).toEqual({});
  });

  it("seçenek değerleri paylaşılan koşulla aynı sözcükleri kullanır", () => {
    // Panel ile API aynı kaynaktan okumazsa filtre sessizce hiçbir şey yapmaz.
    expect(loginStateWhere("never")).toEqual({ lastLoginAt: null });
    expect(loginStateWhere("logged_in")).toEqual({
      lastLoginAt: { not: null },
    });
    expect(loginStateWhere(undefined)).toEqual({});
  });
});
