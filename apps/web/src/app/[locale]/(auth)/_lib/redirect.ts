/** @format */

import { safeReturnTo } from "@/lib/returnTo";

const LOGIN_REDIRECT_KEY = "login_redirect";

/**
 * Giriş sonrası hedef: sessionStorage ipucu → `?redirect` → ana sayfa. İkisi de
 * `safeReturnTo`'dan geçer (tek doğrulayıcı: açık yönlendirme, kontrol karakteri,
 * locale öneki); güvenli olmayan ipucu sonraki kaynağa düşer.
 */
export function pickLoginRedirect(
  stored: string | null | undefined,
  fromQuery: string | null | undefined,
): string {
  return safeReturnTo(stored) ?? safeReturnTo(fromQuery) ?? "/";
}

/** `pickLoginRedirect`'in tarayıcı kaynaklarını okuyan hali (ipucu tek kullanımlık). */
export function resolveLoginRedirect(): string {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(LOGIN_REDIRECT_KEY);
    if (stored) sessionStorage.removeItem(LOGIN_REDIRECT_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
  return pickLoginRedirect(
    stored,
    new URLSearchParams(window.location.search).get("redirect"),
  );
}
