/**
 * Phone utilities — ülke kodu listesi ve telefon formatlama helper'ları.
 * apps/web/src/lib/phone.ts ile aynı davranış; mobil formlar (adres, checkout vb.)
 * buradan import etmeli.
 */

export interface CountryCode {
  code: string;
  country: string;
  name: string;
}

export const countryCodes: CountryCode[] = [
  { code: '+90', country: 'TR', name: 'Türkiye' },
  { code: '+1', country: 'US', name: 'ABD/Kanada' },
  { code: '+44', country: 'GB', name: 'İngiltere' },
  { code: '+49', country: 'DE', name: 'Almanya' },
  { code: '+33', country: 'FR', name: 'Fransa' },
  { code: '+39', country: 'IT', name: 'İtalya' },
  { code: '+34', country: 'ES', name: 'İspanya' },
  { code: '+31', country: 'NL', name: 'Hollanda' },
  { code: '+32', country: 'BE', name: 'Belçika' },
  { code: '+41', country: 'CH', name: 'İsviçre' },
  { code: '+43', country: 'AT', name: 'Avusturya' },
  { code: '+46', country: 'SE', name: 'İsveç' },
  { code: '+47', country: 'NO', name: 'Norveç' },
  { code: '+45', country: 'DK', name: 'Danimarka' },
  { code: '+358', country: 'FI', name: 'Finlandiya' },
  { code: '+7', country: 'RU', name: 'Rusya' },
  { code: '+971', country: 'AE', name: 'BAE' },
  { code: '+966', country: 'SA', name: 'Suudi Arabistan' },
  { code: '+20', country: 'EG', name: 'Mısır' },
  { code: '+81', country: 'JP', name: 'Japonya' },
  { code: '+86', country: 'CN', name: 'Çin' },
  { code: '+82', country: 'KR', name: 'Güney Kore' },
  { code: '+61', country: 'AU', name: 'Avustralya' },
  { code: '+64', country: 'NZ', name: 'Yeni Zelanda' },
];

export const DEFAULT_COUNTRY_CODE = '+90';

/**
 * TR numaralarını XXX XXX XX XX şeklinde formatlar; diğer ülkeler için sadece
 * non-digit karakterleri temizler. TR'de baştaki "90" (autofill: +90 5XX…) ve
 * "0" (alışkanlık: 05XX…) prefix'leri normalize edilir.
 */
export function formatPhoneNumber(value: string, countryCode: string = DEFAULT_COUNTRY_CODE): string {
  let digits = value.replace(/\D/g, '');

  if (countryCode === DEFAULT_COUNTRY_CODE) {
    if (digits.startsWith('90') && digits.length > 10) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    const limited = digits.slice(0, 10);
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  }

  return digits;
}

/** Telefon numarası zaten bir ülke kodu prefix'i içeriyor mu? */
export function hasCountryCodePrefix(phone: string): boolean {
  const clean = phone.replace(/\s/g, '');
  return countryCodes.some((cc) => clean.startsWith(cc.code));
}

/**
 * Payload için telefon numarasını normalize eder: boşlukları temizler,
 * zaten ülke kodu varsa olduğu gibi döner; yoksa verilen ülke kodunu prefix olarak ekler.
 */
export function normalizePhoneForPayload(phone: string | undefined, countryCode: string): string {
  const clean = (phone ?? '').replace(/\s/g, '');
  if (!clean) return '';
  if (hasCountryCodePrefix(clean)) return clean;
  return countryCode + clean;
}

/**
 * Kayıtlı (muhtemelen "+90532…" formatındaki) numarayı ülke kodu + formatlı
 * lokal parçaya ayırır. Eşleşen kod yoksa varsayılan ülke kodu kabul edilir.
 */
export function splitPhone(full: string | undefined): { countryCode: string; phone: string } {
  const clean = (full ?? '').replace(/\s/g, '');
  // En uzun kod önce denenmeli (+9 yok ama +1 / +1X gibi çakışmalara karşı güvenli)
  const cc = [...countryCodes]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => clean.startsWith(c.code));
  if (cc) return { countryCode: cc.code, phone: formatPhoneNumber(clean.slice(cc.code.length), cc.code) };
  return { countryCode: DEFAULT_COUNTRY_CODE, phone: formatPhoneNumber(clean, DEFAULT_COUNTRY_CODE) };
}

/** Ülke koduna göre tipik placeholder. */
export function getPhonePlaceholder(countryCode: string, fallback = 'Telefon'): string {
  return countryCode === DEFAULT_COUNTRY_CODE ? '5XX XXX XX XX' : fallback;
}
