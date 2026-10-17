import { Transform } from "class-transformer";

/**
 * Temizlenebilir alanlar için: boş ya da yalnız-boşluk dize → `null`.
 *
 * Güncelleme sözleşmesinde `null` = "alanı temizle", alan yok = "dokunma".
 * Formlar boşaltılan bir alanı çoğu zaman `""` olarak gönderir; o değer
 * `@IsUrl`/`@IsDateString` gibi kurallara takılıp 400 olur ya da veritabanına
 * anlamsız boş dize olarak yazılırdı. `BlankToUndefined`'ın aksine değeri
 * düşürmez, temizleme isteği olarak taşır.
 *
 * `enableImplicitConversion` sayısal alanda `""`'yi çoktan `0`'a çevirmiş
 * olabilir; bu yüzden ham girdiye (`obj[key]`) bakılır.
 */
export function BlankToNull(): PropertyDecorator {
  return Transform(({ value, key, obj }) => {
    const raw = obj?.[key];
    return typeof raw === "string" && raw.trim() === "" ? null : value;
  });
}
