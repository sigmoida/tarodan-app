import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { RegisterDto } from "../../modules/auth/dto/register.dto";
import { CorporateInvitationDto } from "../../modules/auth/dto/business-register.dto";
import { ResetPasswordDto as AuthResetPasswordDto } from "../../modules/auth/dto/reset-password.dto";
import {
  ChangePasswordDto,
  ResetPasswordDto as SecurityResetPasswordDto,
} from "../../modules/security/dto/security.dto";

/**
 * Şifre politikası TEK kuraldır (`@tarodan/types` password-policy): tüm
 * "yeni şifre" DTO'ları aynı değerleri kabul/ret etmeli. Özel karakter zorunlu
 * değil; Türkçe harf, boşluk ve sembol serbest.
 */
const ACCEPT = ["Abcdefg1", "Tarodan2026.", "Şifre123!", "Abc 1234!",
  "ĞÜŞİÖÇ12ab",
  "ğüşiöç12AB",
  "ŞİFREçok1",
];
const REJECT = ["abcdefg1", "ABCDEFG1", "Abcdefgh", "Ab1"];

const registerBase = {
  username: "gorkemtest",
  email: "test@demo.com",
  displayName: "Test Kullanıcı",
};
const invitationBase = { token: "t", username: "tarodan.kurumsal" };

const cases: Array<[string, (pw: string) => unknown, string]> = [
  [
    "RegisterDto",
    (pw) => plainToInstance(RegisterDto, { ...registerBase, password: pw }),
    "password",
  ],
  [
    "CorporateInvitationDto",
    (pw) =>
      plainToInstance(CorporateInvitationDto, { ...invitationBase, password: pw }),
    "password",
  ],
  [
    "auth ResetPasswordDto",
    (pw) => plainToInstance(AuthResetPasswordDto, { token: "t", newPassword: pw }),
    "newPassword",
  ],
  [
    "security ResetPasswordDto",
    (pw) =>
      plainToInstance(SecurityResetPasswordDto, { token: "t", newPassword: pw }),
    "newPassword",
  ],
  [
    "ChangePasswordDto",
    (pw) =>
      plainToInstance(ChangePasswordDto, {
        currentPassword: "old",
        newPassword: pw,
      }),
    "newPassword",
  ],
];

const errorsFor = (instance: unknown, property: string) =>
  validateSync(instance as object).filter((e) => e.property === property);

describe.each(cases)("şifre politikası — %s", (_name, build, property) => {
  it.each(ACCEPT)("kabul eder: %s", (pw) => {
    expect(errorsFor(build(pw), property)).toHaveLength(0);
  });

  it.each(REJECT)("reddeder: %s", (pw) => {
    expect(errorsFor(build(pw), property).length).toBeGreaterThan(0);
  });

  it("üst sınırı aşan şifreyi reddeder", () => {
    expect(errorsFor(build("Aa1" + "x".repeat(70)), property)).not.toHaveLength(0);
  });
});
