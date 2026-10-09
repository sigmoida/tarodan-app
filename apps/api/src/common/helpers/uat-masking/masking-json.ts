/**
 * Kayıpsız JSON gidiş-dönüşü — maskeleme JSON hücrelerini ayrıştırıp yeniden
 * yazarken sayıları BOZMAMALI.
 *
 * `JSON.parse` her sayıyı IEEE-754 double'a çevirir: 2^53 üstü tam sayılar
 * (sağlayıcı kimlikleri, büyük tutarlar) yuvarlanır, `10.50` gibi bir değer
 * `10.5` olur. Bu yüzden ayrıştırmadan ÖNCE, `Number`'a gidip geri gelince
 * metni değişen her sayı belirteci bir yer tutucu metne sarılır; serileştirirken
 * aynen geri açılır. Yer tutucu NUL ile başlar: Postgres `jsonb` NUL taşıyan
 * metin kabul etmediği için gerçek bir değerle karışamaz.
 */

const PRESERVED_PREFIX = "\u0000num:";

/** JSON metnindeki metin belirteçleri ve sayı belirteçleri (sırayla). */
const TOKEN_PATTERN = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** Serileştirilmiş yer tutucu: `"\u0000num:<sayı>"`. */
const SERIALIZED_PRESERVED = /"\\u0000num:(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"/g;

export function isPreservedNumber(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PRESERVED_PREFIX);
}

export function parseJsonPreservingNumbers(text: string): unknown {
  const guarded = text.replace(TOKEN_PATTERN, (token) =>
    token.startsWith('"') || String(Number(token)) === token
      ? token
      : JSON.stringify(`${PRESERVED_PREFIX}${token}`),
  );
  return JSON.parse(guarded);
}

export function stringifyJsonPreservingNumbers(value: unknown): string {
  return JSON.stringify(value).replace(SERIALIZED_PRESERVED, "$1");
}
