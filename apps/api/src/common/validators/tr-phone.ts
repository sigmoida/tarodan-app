import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from "class-validator";
import { isValidTrPhone } from "@tarodan/types";

/**
 * TR telefon doğrulaması — TEK KAYNAK (`@tarodan/types`'daki TR_PHONE_E164).
 *
 * Platform yalnızca Türkiye'ye hizmet ediyor: adreste ülke alanı yok, şehir 81
 * ilin kapalı listesinden geliyor, Sürat yurt içi kargo, PayTR TL ile çalışıyor.
 * Yabancı bir numaranın checkout'ta karşılığı olmadığı için her giriş noktasında
 * reddedilir; aksi halde kargo katmanındaki normalizasyon onu sessizce bozuyor.
 *
 * Beklenen biçim depolanan biçimdir: `+905XXXXXXXXX`. İstemci ham girdiyi
 * (`0532…`, boşluklu, `+90` önekli) `combinePhone` ile buna çevirip gönderir.
 */
export function IsTrPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isTrPhone",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidTrPhone(typeof value === "string" ? value : null);
        },
        defaultMessage(_args: ValidationArguments) {
          return "Geçerli bir Türkiye cep numarası giriniz (+905XXXXXXXXX)";
        },
      },
    });
  };
}
