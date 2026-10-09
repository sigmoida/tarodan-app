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
/** IBAN'ı karşılaştırma/saklama biçimine getir: boşluksuz, büyük harf. */
export function normalizeTrIban(iban: string | null | undefined): string {
  return (iban || "").replace(/\s/g, "").toUpperCase();
}

/** ISO 7064 mod-97: harfler 10..35'e açılır, kalan hane hane hesaplanır. */
function ibanMod97(value: string): number {
  const numeric = value.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  );
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}

export function isValidTrIban(iban: string): boolean {
  const v = normalizeTrIban(iban);
  if (!/^TR\d{24}$/.test(v)) return false;
  return ibanMod97(v.slice(4) + v.slice(0, 4)) === 1;
}

/**
 * 22 haneli BBAN (5 banka kodu + 1 rezerv + 16 hesap) için "TR" sonrası iki
 * kontrol hanesi. Doğrulamayla AYNI mod-97 — UAT maskeleme sahte IBAN'ı
 * bununla üretir, ikinci bir checksum kopyası olmasın.
 */
export function trIbanCheckDigits(bban: string): string {
  if (!/^\d{22}$/.test(bban)) {
    throw new Error("TR BBAN must be exactly 22 digits");
  }
  return String(98 - ibanMod97(`${bban}TR00`)).padStart(2, "0");
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
