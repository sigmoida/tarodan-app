/**
 * Apple'ın kimlik uçlarına (token / revoke) form POST'u — DURUM KODUYLA.
 *
 * `apple-signin-auth`ın `revokeAuthorizationToken`ı yanıtın durumuna bakmadan
 * gövdeyi döndürür: 5xx boş gövde `""` gelir ve "başarı" gibi görünür. İptal
 * kararı yalnız 2xx'e dayanmalı, bu yüzden çağrı burada yapılır; kütüphane
 * yalnız client secret imzası için kullanılır.
 */
export const APPLE_ID_ENDPOINT = "https://appleid.apple.com";

/**
 * Apple çağrısı üst sınırı. Yavaş bir Apple ne girişi (takas arka planda) ne
 * outbox drainer'ını (iptal) tutmalı; süre dolunca istek iptal edilir ve
 * çağıran onu geçici hata sayar.
 */
export const APPLE_REQUEST_TIMEOUT_MS = 5_000;

export interface AppleEndpointResponse {
  status: number;
  /** Yalnız 2xx. */
  ok: boolean;
  /** JSON gövde (hata yanıtında `{ error }`); boş ya da JSON değilse null. */
  body: Record<string, unknown> | null;
}

export async function postAppleEndpoint(
  path: "/auth/token" | "/auth/revoke",
  params: Record<string, string>,
  timeoutMs: number = APPLE_REQUEST_TIMEOUT_MS,
): Promise<AppleEndpointResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${APPLE_ID_ENDPOINT}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: parseJsonObject(text) };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Token yanıtındaki `id_token`ın iddiaları (imza DOĞRULANMAZ: belirteç Apple'dan
 * TLS üzerinden, bizim client secret'ımızla alınan yanıttan okunur — amaç
 * kodun hangi kimliğe/uygulamaya ait olduğunu görmektir). Okunamazsa null.
 */
export function idTokenClaims(
  idToken: unknown,
): { sub?: unknown; aud?: unknown } | null {
  if (typeof idToken !== "string") return null;
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  return parseJsonObject(Buffer.from(payload, "base64url").toString("utf8"));
}

/** Hata gövdesindeki OAuth hata kodu (`invalid_grant` vb.), yoksa null. */
export function appleErrorCode(
  response: Pick<AppleEndpointResponse, "body">,
): string | null {
  const error = response.body?.error;
  return typeof error === "string" && error ? error : null;
}
