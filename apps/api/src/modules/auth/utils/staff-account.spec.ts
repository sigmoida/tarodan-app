import { UnauthorizedException } from "@nestjs/common";
import {
  assertNotStaffAccount,
  isStaffAccount,
  STAFF_ACCOUNT_ERROR_CODE,
} from "./staff-account";

describe("staff-account — personel hesabı müşteri oturumu açamaz", () => {
  it("AdminUser satırı olan hesap personeldir (aktif/pasif fark etmez)", () => {
    expect(isStaffAccount({ adminUser: { id: "a1" } })).toBe(true);
    expect(isStaffAccount({ adminUser: { id: "a1", isActive: false } })).toBe(
      true,
    );
    expect(isStaffAccount({ adminUser: null })).toBe(false);
    expect(isStaffAccount({})).toBe(false);
  });

  it("personel için 401 STAFF_ACCOUNT + i18n anahtarı fırlatır", () => {
    let caught: unknown;
    try {
      assertNotStaffAccount({ adminUser: { id: "a1" } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect((caught as UnauthorizedException).getResponse()).toMatchObject({
      i18nKey: "server.auth.staffAccountCustomerLogin",
      errorCode: STAFF_ACCOUNT_ERROR_CODE,
    });
  });

  it("müşteri hesabında sessizce geçer", () => {
    expect(() => assertNotStaffAccount({ adminUser: null })).not.toThrow();
  });
});
