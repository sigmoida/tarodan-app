import { Transform } from "class-transformer";

/**
 * Query-string clients (özellikle mobil) boş filtreleri `?status=&limit=` diye
 * gönderebilir. `@IsOptional` yalnız null/undefined'ı atladığı için boş string
 * `@IsEnum`/`@IsInt` gibi kurallara takılıp 400 üretir; bu dekoratör boş ve
 * yalnız-boşluk değerleri doğrulamadan önce `undefined`'a çevirir.
 *
 * `@Type(() => Number)` transform'dan önce koştuğu için `value` çoktan `0`
 * olabilir; bu yüzden ham girdiye (`obj[key]`) bakılır.
 */
export function BlankToUndefined(): PropertyDecorator {
  return Transform(({ value, key, obj }) => {
    const raw = obj?.[key];
    return typeof raw === "string" && raw.trim() === "" ? undefined : value;
  });
}
