import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from "class-validator";
import {
  validateLocalizedText,
  type LocalizedTextRules,
} from "@tarodan/types";

/**
 * İki dilli içerik metni (`LocalizedText`) doğrulayıcısı. Kural tek kaynaktan:
 * `validateLocalizedText` (@tarodan/types) — admin formu aynı fonksiyonu
 * çalıştırır. Türkçe her zaman zorunlu (İngilizce verilmişse bile); dil başına
 * `maxLength`.
 *
 * Temizlenebilir alanda `@IsOptional()` ile birlikte kullanılır: `null` alanı
 * temizler, iki dili de boş nesne servis tarafında `null`'a indirilir
 * (`normalizeLocalizedText`).
 */
export function IsLocalizedText(
  rules: LocalizedTextRules,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isLocalizedText",
      target: object.constructor,
      propertyName,
      constraints: [rules],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return validateLocalizedText(value, rules) === null;
        },
        defaultMessage(args: ValidationArguments) {
          const code = validateLocalizedText(args.value, rules);
          return `${args.property} must be { tr, en? } text (tr required, at most ${rules.maxLength} characters per language): ${code ?? "invalid"}`;
        },
      },
    });
  };
}
