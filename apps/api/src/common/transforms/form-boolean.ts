import { Transform } from "class-transformer";

const TRUE_LITERALS = new Set(["true", "1", "on"]);
const FALSE_LITERALS = new Set(["false", "0", "off"]);

/**
 * Multipart form alanları (ve query string) METİN olarak gelir. Global
 * ValidationPipe `enableImplicitConversion` ile çalıştığı için `boolean` alan
 * `Boolean("false")` ile çevrilir ve `"false"`, `"0"` gibi her boş olmayan
 * metin `true` olur. Bu dekoratör ham girdiye (`obj[key]`) bakıp metni gerçek
 * boolean'a çevirir:
 *   - `true` / `false` (JSON gövdesi) → olduğu gibi
 *   - "true" | "1" | "on" → true, "false" | "0" | "off" → false (büyük/küçük harf fark etmez)
 *   - boş / yalnız-boşluk → undefined (alan hiç gönderilmemiş sayılır)
 *   - tanınmayan değer → ham metin aynen kalır, `@IsBoolean` 400 üretir
 *
 * TODO: başka dalda aynı işi yapan paylaşımlı `QueryBoolean()` var; birleşimde
 * tek dekoratöre indirilmeli.
 */
export function FormBoolean(): PropertyDecorator {
  return Transform(({ value, key, obj }) => {
    const raw: unknown = obj?.[key];
    if (typeof raw === "boolean") return raw;
    if (typeof raw !== "string") return value;

    const text = raw.trim().toLowerCase();
    if (text === "") return undefined;
    if (TRUE_LITERALS.has(text)) return true;
    if (FALSE_LITERALS.has(text)) return false;
    return raw;
  });
}
