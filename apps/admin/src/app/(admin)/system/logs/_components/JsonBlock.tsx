/** Frontend defense: mask sensitive keys (backend already masks — this is an extra layer). */
import { useTranslations } from "next-intl";

const REDACT_KEYS = new Set([
  "password",
  "passwordHash",
  "passwordConfirm",
  "newPassword",
  "oldPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "resetToken",
  "verifyToken",
  "confirmToken",
  "idToken",
  "secret",
  "apiKey",
  "apiSecret",
  "clientSecret",
  "signingKey",
  "creditCard",
  "cardNumber",
  "cvv",
  "cvc",
  "pin",
  "otp",
]);

function redactDisplay(obj: any, redactedLabel: string, depth = 0): any {
  if (depth > 5 || obj === null || obj === undefined || typeof obj !== "object")
    return obj;
  if (Array.isArray(obj))
    return obj.map((v) => redactDisplay(v, redactedLabel, depth + 1));
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      REDACT_KEYS.has(k)
        ? redactedLabel
        : redactDisplay(v, redactedLabel, depth + 1),
    ]),
  );
}

export function JsonBlock({ value }: { value: any }) {
  const t = useTranslations();
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-surface p-2 text-xs text-muted">
      {JSON.stringify(
        redactDisplay(value, t("admin.system.logs.details.redacted")),
        null,
        2,
      )}
    </pre>
  );
}
