import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { LEGAL_IDENTITY_FIELDS } from "@tarodan/types";
import { UpdateProfileDto } from "./update-profile.dto";

/**
 * Üye yasal kimliğini profil güncellemesiyle DEĞİŞTİREMEZ: `PATCH /users/me`
 * DTO'su bu alanları tanımlamaz, global ValidationPipe (`whitelist: true`)
 * onları düşürür. Tek yazım yolu kimlik kapısıdır (yalnız eksik alanlar) ve
 * admin düzeltmesidir.
 */
describe("UpdateProfileDto — yasal kimlik yazılamaz", () => {
  it("yasal kimlik alanları whitelist ile düşer", async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      displayName: "Ayşe",
      legalFirstName: "Başka",
      legalLastName: "Biri",
      nationalId: "12345678950",
    });

    await validate(dto, { whitelist: true });

    for (const field of LEGAL_IDENTITY_FIELDS) {
      expect(dto).not.toHaveProperty(field);
    }
  });
});
