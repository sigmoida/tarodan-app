/**
 * Türkçe metni ASCII'ye indirger.
 *
 * Slug üretimi ve serbest metin eşleştirme `[^\w]` temizliği yapıyor; JS'te
 * `\w` yalnız ASCII olduğu için "Kırmızı" → "krmz", "Ölçek" → "lek" gibi
 * okunamaz sonuçlar çıkıyordu. Harfler önce buradan geçirilmeli.
 */
const TR_CHAR_MAP: Record<string, string> = {
  ı: "i",
  İ: "I",
  ş: "s",
  Ş: "S",
  ğ: "g",
  Ğ: "G",
  ü: "u",
  Ü: "U",
  ö: "o",
  Ö: "O",
  ç: "c",
  Ç: "C",
  â: "a",
  Â: "A",
  î: "i",
  Î: "I",
  û: "u",
  Û: "U",
};

export function transliterateTurkish(value: string): string {
  return value
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, (char) => TR_CHAR_MAP[char] ?? char)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
