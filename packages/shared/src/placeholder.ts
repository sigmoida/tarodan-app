/** @format */

/**
 * Görsel yer tutucusu — TEK kaynak.
 *
 * Adres 13 dosyada elle tekrarlanıyor ve her biri `?text=Ürün` gibi Türkçe bir
 * etiket taşıyordu. O metin GÖRSELİN İÇİNE yazılır: katalogdan gelemez, dil
 * değiştiğinde güncellenmez ve çevrilemez. Bu yüzden yer tutucu artık etiketsiz;
 * yalnız boyut ve renk verir.
 *
 * @param size `"200x200"` biçiminde genişlik×yükseklik.
 */
export const imagePlaceholder = (
  size: string,
  bg = "f3f4f6",
  fg = "9ca3af",
): string => `https://placehold.co/${size}/${bg}/${fg}`;
