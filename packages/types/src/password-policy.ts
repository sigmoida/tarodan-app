/**
 * Şifre politikası — TEK KAYNAK.
 *
 * Kayıt, şifre sıfırlama, şifre değiştirme ve kurumsal davet aynı kuralı
 * kullanır: en az 8 karakter, en az bir büyük harf, bir küçük harf, bir rakam.
 * Başka karakter (Türkçe harf, boşluk, sembol) serbesttir; özel karakter ZORUNLU
 * DEĞİLDİR. API doğrulayıcıları (`@IsPassword`), web zod şemaları ve canlı
 * gereksinim listesi buradan beslenir; böylece arayüzün "geçerli" dediği şifre
 * API'den 400 almaz.
 */

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt 72 baytın ötesini keser; üst sınır tek yerde. */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Büyük harf + küçük harf + rakam içerme (uzunluk ayrıca denetlenir).
 * Unicode farkında: Ş, İ, ç gibi Türkçe harfler de sayılır.
 */
export const PASSWORD_PATTERN = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\p{Nd})/u;

export const PASSWORD_MIN_LENGTH_MESSAGE = `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır`;
export const PASSWORD_MAX_LENGTH_MESSAGE = `Şifre en fazla ${PASSWORD_MAX_LENGTH} karakter olabilir`;
export const PASSWORD_COMPLEXITY_MESSAGE =
  "Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir";

export interface PasswordChecks {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
}

/** Kuralların her biri için ayrı sonuç (canlı gereksinim listesi için). */
export function passwordChecks(password: string): PasswordChecks {
  return {
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /\p{Lu}/u.test(password),
    hasLowercase: /\p{Ll}/u.test(password),
    hasNumber: /\p{Nd}/u.test(password),
  };
}

/** Bütün kurallar sağlanıyor mu (üst sınır dahil). */
export function isPasswordValid(password: string): boolean {
  const c = passwordChecks(password);
  return (
    c.hasMinLength &&
    c.hasUppercase &&
    c.hasLowercase &&
    c.hasNumber &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}
