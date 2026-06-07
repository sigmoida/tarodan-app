import { randomInt } from 'crypto';

/**
 * Karışabilen karakterler bilinçli olarak çıkarıldı:
 * 0/O, 1/I/L ve U yok. Telefonla okunması / elle yazılması kolay.
 * 30 karakterlik alfabe → 10 hane = 30^10 ≈ 5.9 × 10^14 olası kod.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Önekli, tahmin edilemez (kriptografik rastgele) referans kodu üretir.
 * Sıralı/sayım sızdırmaz, enumerasyon edilemez.
 *
 * @example generateReferenceCode('ORD') // -> 'ORD-K7X9M2QF3N'
 */
export function generateReferenceCode(prefix: string, length = 10): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    // randomInt = CSPRNG (Math.random tahmin edilebilir olduğu için kullanılmaz)
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `${prefix}-${code}`;
}

/**
 * Çakışmayan bir referans kodu üretir. `exists` ile DB'de var olup olmadığı
 * kontrol edilir; çakışırsa yeniden denenir. Son çare olarak uzunluk artırılır.
 *
 * Not: İlgili kolonda `@unique` kısıtı son güvence olarak durmalıdır.
 */
export async function generateUniqueReference(
  prefix: string,
  exists: (code: string) => Promise<boolean>,
  length = 10,
  maxAttempts = 6,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateReferenceCode(prefix, length);
    if (!(await exists(code))) {
      return code;
    }
  }
  // Aşırı düşük ihtimal: uzunluğu artırarak son bir deneme yap.
  return generateReferenceCode(prefix, length + 4);
}
