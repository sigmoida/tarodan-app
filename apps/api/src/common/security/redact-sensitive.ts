const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "passwordconfirm",
  "newpassword",
  "oldpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "resettoken",
  "verifytoken",
  "confirmtoken",
  "idtoken",
  "authorization",
  "cookie",
  "setcookie",
  "secret",
  "apikey",
  "apisecret",
  "clientsecret",
  "signingkey",
  "creditcard",
  "card",
  "cardnumber",
  "pan",
  "cvv",
  "cvc",
  "pin",
  "otp",
  "cardholdername",
  "ccowner",
  "expiry",
  "expirymonth",
  "expiryyear",
]);

const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

function passesLuhn(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function redactPanStrings(value: string): string {
  return value.replace(/(?:\d[ -]?){13,19}/g, (candidate) =>
    passesLuhn(candidate) ? "[REDACTED]" : candidate,
  );
}

/**
 * Query-string anahtarları için ek liste: sağlayıcı sözleşmeleri kimliği URL'de
 * taşıyabiliyor (Sürat `CariKodu`/`Sifre`). Değer olarak `***` yazılır; URL'nin
 * yolu ve diğer parametreleri okunur kalır.
 */
const SENSITIVE_QUERY_KEYS = new Set([
  ...SENSITIVE_KEYS,
  "sifre",
  "carikodu",
  "key",
  "signature",
  "sig",
]);

/**
 * URL ya da URL içeren bir metindeki hassas query parametrelerini maskeler.
 * Parse etmez, tam metin üzerinde çalışır: hata mesajı gibi URL'nin gömülü
 * olduğu dizelerde de işe yarar ve geçersiz URL'de patlamaz.
 */
export function redactUrlQuery(value: string): string {
  return value.replace(
    /([?&])([^=&#\s]+)=([^&#\s]*)/g,
    (match, sep: string, key: string) =>
      SENSITIVE_QUERY_KEYS.has(normalizeKey(key)) ? `${sep}${key}=***` : match,
  );
}

/**
 * Produces a serializable copy suitable for logs and telemetry. Sensitive keys
 * are matched case/format-insensitively and PAN-looking strings are removed
 * even when nested under an unexpected key.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[TRUNCATED]";
  if (typeof value === "string") return redactPanStrings(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(normalizeKey(key))
        ? "[REDACTED]"
        : redactSensitive(nested, depth + 1),
    ]),
  );
}
