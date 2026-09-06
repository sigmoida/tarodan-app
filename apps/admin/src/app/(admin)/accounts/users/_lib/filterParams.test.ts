import { describe, expect, it } from "vitest";
import { loginStateWhere } from "@tarodan/types";
import {
  accountStatusParams,
  loginStateParams,
  userFilterParams,
} from "./types";

describe("accountStatusParams", () => {
  it("'all' ve boş değer filtre göndermez (varsayılan: silinmişler gizli)", () => {
    expect(accountStatusParams("all")).toEqual({});
    expect(accountStatusParams(undefined)).toEqual({});
  });

  it("seçili durumu geçirir", () => {
    expect(accountStatusParams("pending_activation")).toEqual({
      accountStatus: "pending_activation",
    });
  });

  it("kaydedilmiş ?filter=banned bağlantısı hâlâ engellileri getirir", () => {
    // Eski "Engelliler" kullanıcı-türü seçeneğiydi; eşlenmezse liste sessizce
    // TÜM kullanıcıları gösterirdi.
    expect(accountStatusParams("all", "banned")).toEqual({
      accountStatus: "banned",
    });
  });

  it("açık hesap durumu eski değeri ezer", () => {
    expect(accountStatusParams("active", "banned")).toEqual({
      accountStatus: "active",
    });
  });
});

describe("userFilterParams", () => {
  it("alıcı/satıcı ayrımını isSeller'a çevirir", () => {
    expect(userFilterParams("sellers")).toEqual({ isSeller: true });
    expect(userFilterParams("buyers")).toEqual({ isSeller: false });
    expect(userFilterParams("all")).toEqual({ isSeller: undefined });
  });

  it("eski 'banned' değeri kullanıcı türünü daraltmaz", () => {
    expect(userFilterParams("banned")).toEqual({ isSeller: undefined });
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
