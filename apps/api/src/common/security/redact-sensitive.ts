import { LEGAL_IDENTITY_FIELDS } from "@tarodan/types";

/**
 * Kişisel kimlik alanları — loglara, Sentry'ye ve hata kayıtlarına DEĞER olarak
 * girmez. Yasal kimlik alanları (`@tarodan/types` LEGAL_IDENTITY_FIELDS) +
 * banka hesabındaki eski TCKN alanı. Hata kaydı (`ErrorLogInterceptor`) ve admin
 * denetim kaydı (`AdminAuditService`) aynı listeyi kullanır.
 */
export const IDENTITY_LOG_KEYS: readonly string[] = [
  ...LEGAL_IDENTITY_FIELDS,
  "tcKimlikNo",
];

const SENSITIVE_KEYS = new Set([
  ...IDENTITY_LOG_KEYS.map((key) => key.toLowerCase()),
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
  // Sign in with Apple: giriş gövdesindeki kimlik belirteci ve tek kullanımlık
  // yetkilendirme kodu (refresh token'a çevrilir) ile şifreli token kolonu.
  "identitytoken",
  "authorizationcode",
  "refreshtokenencrypted",
  // Step-up token (`POST /auth/reauth`), sent back in sensitive write bodies.
  "reauthtoken",
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
 * Keys that are credentials only inside a request body. There `code` is a 2FA,
 * phone or e-mail change code or a Google auth code; elsewhere in an event it
 * is a Prisma or Node error code (`P2002`, `ECONNREFUSED`) that must stay
 * readable, so it is not in `SENSITIVE_KEYS`.
 */
const REQUEST_BODY_SENSITIVE_KEYS: ReadonlySet<string> = new Set(["code"]);

/**
 * Produces a serializable copy suitable for logs and telemetry. Sensitive keys
 * are matched case/format-insensitively and PAN-looking strings are removed
 * even when nested under an unexpected key. `extraKeys` (normalised) adds keys
 * for one context, such as a request body.
 */
export function redactSensitive(
  value: unknown,
  depth = 0,
  extraKeys?: ReadonlySet<string>,
): unknown {
  if (depth > 10) return "[TRUNCATED]";
  if (typeof value === "string") return redactPanStrings(value);
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1, extraKeys));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const normalized = normalizeKey(key);
      return [
        key,
        SENSITIVE_KEYS.has(normalized) || extraKeys?.has(normalized)
          ? "[REDACTED]"
          : redactSensitive(nested, depth + 1, extraKeys),
      ];
    }),
  );
}

/**
 * A request body for logs and telemetry: `redactSensitive` plus the
 * body-only keys. Sentry keeps the body as a JSON string
 * (`event.request.data`), which a key-based pass cannot see into, so a JSON
 * string is parsed, redacted and serialised again. Any other string is left to
 * the PAN pass.
 */
export function redactRequestBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return redactSensitive(body, 0, REQUEST_BODY_SENSITIVE_KEYS);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return redactPanStrings(body);
  }
  return JSON.stringify(
    redactSensitive(parsed, 0, REQUEST_BODY_SENSITIVE_KEYS),
  );
}
