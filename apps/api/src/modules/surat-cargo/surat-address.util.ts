/**
 * Sürat Kargo gönderi alanları için adres/telefon normalizasyonu.
 *
 * Sürat il/ilçe'yi İSİM olarak, telefonu ulusal formatta bekler. Kullanıcı
 * verisi (özellikle telefon) "+90 555 ...", "0 555 ...", "905..." gibi farklı
 * biçimlerde gelebildiğinden, Sürat'a göndermeden önce tek biçime indiriyoruz.
 */

/** Telefonu `05XXXXXXXXX` (11 hane) biçimine indirger. Çözemezse en iyi çabayla
 *  rakamları döndürür (boşsa boş string). */
export function normalizeSuratPhone(raw?: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';

  let national = digits;
  // Ülke kodu (+90 / 90) varsa düş
  if (national.startsWith('90') && national.length >= 12) {
    national = national.slice(2);
  }
  // Baştaki 0'ı düş
  if (national.startsWith('0')) {
    national = national.slice(1);
  }
  // Geçerli GSM: 10 hane ve 5 ile başlar → 0 ekleyip döndür
  if (national.length === 10 && national.startsWith('5')) {
    return '0' + national;
  }
  // Çözemedik: olduğu gibi (0 ile başlayacak şekilde) döndür
  return digits.startsWith('0') ? digits : '0' + digits;
}

/** İl/ilçe isimlerini Sürat için temizler (baştaki/sondaki boşluk + çoklu boşluk). */
export function normalizeSuratLocation(raw?: string | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}
