import { ValidateIf } from "class-validator";

/**
 * Yalnız `undefined` iken doğrulamayı atlar: null'ı REDDETMEK için. Şemada
 * null olamayan alanlarda `@IsOptional()` null'ı geçirir ve hata Prisma'da 500
 * olarak patlardı. PATCH gövdelerinde: alan yok = dokunma, `null` = 400.
 */
export const IsOptionalNotNull = () =>
  ValidateIf((_, value) => value !== undefined);
