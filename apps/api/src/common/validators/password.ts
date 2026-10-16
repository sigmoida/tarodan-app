import { applyDecorators } from "@nestjs/common";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_PATTERN,
} from "@tarodan/types";

/**
 * Yeni belirlenen şifre için TEK doğrulama: kayıt, sıfırlama, değiştirme ve
 * kurumsal kayıt bunu kullanır (kural `@tarodan/types` `password-policy`).
 * Giriş (`login`) ve mevcut şifre alanlarında KULLANILMAZ.
 */
export const IsPassword = (): PropertyDecorator =>
  applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    MaxLength(PASSWORD_MAX_LENGTH, { message: PASSWORD_MAX_LENGTH_MESSAGE }),
    Matches(PASSWORD_PATTERN, { message: PASSWORD_COMPLEXITY_MESSAGE }),
  );
