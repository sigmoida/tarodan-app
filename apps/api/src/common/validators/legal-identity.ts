import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { Transform } from "class-transformer";
import {
  isValidLegalName,
  isValidTckn,
  normalizeLegalName,
  normalizeTckn,
} from "@tarodan/types";

/**
 * Yasal kimlik doğrulaması — TEK KAYNAK `@tarodan/types` (`isValidTckn`,
 * `isValidLegalName`); web ve admin formları aynı fonksiyonları çağırır.
 *
 * Dekoratörler normalize edilmiş değeri doğrular; DTO alanına ayrıca
 * `@NormalizeTckn()` / `@NormalizeLegalName()` konur ki servise de normalize
 * değer gitsin (ValidationPipe `transform: true`, dönüşüm doğrulamadan önce).
 */
export function IsTckn(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isTckn",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidTckn(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return "Geçerli bir T.C. Kimlik Numarası giriniz";
        },
      },
    });
  };
}

export function IsLegalName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isLegalName",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidLegalName(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return "Ad ve soyad yalnız harf içermeli, 2-50 karakter olmalıdır";
        },
      },
    });
  };
}

/**
 * Boş ya da yalnız boşluk metin "gönderilmedi" sayılır (`undefined`): formdan
 * boş gelen opsiyonel alan `@IsOptional` ile atlanır, dolu alanı silemez.
 */
const normalizeOrBlank = (normalize: (value: string) => string) =>
  Transform(({ value }) => {
    if (typeof value !== "string") return value;
    return value.trim() === "" ? undefined : normalize(value);
  });

/** Gelen metni yalnız rakama indirger; metin olmayan değer doğrulamaya kalır. */
export const NormalizeTckn = () => normalizeOrBlank(normalizeTckn);

/** Baş/son boşluğu atar, iç boşlukları teke indirir; harf büyüklüğü korunur. */
export const NormalizeLegalName = () => normalizeOrBlank(normalizeLegalName);
