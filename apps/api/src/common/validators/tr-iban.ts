import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";

/**
 * TR IBAN doğrulaması — TEK KAYNAK. Format ("TR" + 24 rakam = 26 hane) +
 * ISO 7064 mod-97 checksum. Hem DTO doğrulaması (IsTrIban) hem payout
 * servisi (Y4, transfer öncesi son kontrol) bunu kullanır; regex tek başına
 * rastgele rakam dizisini geçirir, checksum ~%99'unu eler.
 */
export function isValidTrIban(iban: string): boolean {
  const v = (iban || "").replace(/\s/g, "").toUpperCase();
  if (!/^TR\d{24}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  );
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

/** class-validator dekoratörü: alan checksum-geçerli bir TR IBAN olmalı. */
export function IsTrIban(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isTrIban",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === "string" && isValidTrIban(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return "Geçerli bir TR IBAN numarası giriniz";
        },
      },
    });
  };
}
