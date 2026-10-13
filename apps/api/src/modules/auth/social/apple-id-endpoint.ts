/**
 * Apple'ın kimlik uçlarına (token / revoke) form POST'u — DURUM KODUYLA.
 *
 * `apple-signin-auth`ın `revokeAuthorizationToken`ı yanıtın durumuna bakmadan
 * gövdeyi döndürür: 5xx boş gövde `""` gelir ve "başarı" gibi görünür. İptal
 * kararı yalnız 2xx'e dayanmalı, bu yüzden çağrı burada yapılır; kütüphane
 * yalnız client secret imzası için kullanılır.
 */
export const APPLE_ID_ENDPOINT = "https://appleid.apple.com";

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
): Promise<AppleEndpointResponse> {
  const res = await fetch(`${APPLE_ID_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  if (text) {
    try {
      const parsed: unknown = JSON.parse(text);
      body =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      body = null;
    }
  }
  return { status: res.status, ok: res.ok, body };
}

/** Hata gövdesindeki OAuth hata kodu (`invalid_grant` vb.), yoksa null. */
export function appleErrorCode(
  response: Pick<AppleEndpointResponse, "body">,
): string | null {
  const error = response.body?.error;
  return typeof error === "string" && error ? error : null;
}
