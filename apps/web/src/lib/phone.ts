/**
 * Phone utilities — ülke kodu listesi ve telefon numarası formatlama helper'ları.
 * Projedeki TEK gerçek kaynak; checkout, register, profile/addresses vb. hepsi buradan
 * import etmeli.
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
 * non-digit karakterleri temizler.
 */
export function formatPhoneNumber(value: string, countryCode: string = DEFAULT_COUNTRY_CODE): string {
  const digits = value.replace(/\D/g, '');

  if (countryCode === DEFAULT_COUNTRY_CODE) {
    const limited = digits.slice(0, 10);
    if (limited.length <= 3) return limited;
    if (limited.length <= 6) return `${limited.slice(0, 3)} ${limited.slice(3)}`;
    if (limited.length <= 8) return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6)}`;
    return `${limited.slice(0, 3)} ${limited.slice(3, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
  }

  return digits;
}

/** Ülke kodunu başa ekler (çift ekleme yapmaz). */
export function getFullPhoneNumber(phone: string, countryCode: string): string {
  const cleanPhone = phone.replace(/\s/g, '');
  if (cleanPhone.startsWith(countryCode)) return cleanPhone;
  return countryCode + cleanPhone;
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
  return hasCountryCodePrefix(clean) ? clean : getFullPhoneNumber(clean, countryCode);
}

/** Ülke koduna göre TR ise 13 (örnek: "5XX XXX XX XX"), diğerleri için 20. */
export function getPhoneMaxLength(countryCode: string): number {
  return countryCode === DEFAULT_COUNTRY_CODE ? 13 : 20;
}

/** Ülke koduna göre tipik placeholder. */
export function getPhonePlaceholder(countryCode: string, fallback = 'Telefon'): string {
  return countryCode === DEFAULT_COUNTRY_CODE ? '5XX XXX XX XX' : fallback;
}
