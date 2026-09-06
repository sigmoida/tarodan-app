/**
 * Giriş durumu filtresi — admin kullanıcı listesinin "hiç giriş yapmadı"
 * ayıklaması için TEK değer kaynağı (panel seçeneği ile API sorgusu aynı
 * sözcükleri kullansın).
 *
 * `never` → `lastLoginAt` boş: kayıt olmuş ama hesabını bir kez bile
 * kullanmamış. Davet/aktivasyon takibinde aranan grup budur.
 * `logged_in` → en az bir kez giriş yapmış.
 */
export const LOGIN_STATES = ["never", "logged_in"] as const;

export type LoginState = (typeof LOGIN_STATES)[number];

/**
 * Filtreyi `lastLoginAt` koşuluna çevirir; filtre yoksa (ya da tanınmayan bir
 * değer geldiyse) koşul üretilmez — liste daralmaz.
 */
export function loginStateWhere(
  state?: LoginState | null,
): { lastLoginAt: null | { not: null } } | Record<string, never> {
  if (state === "never") return { lastLoginAt: null };
  if (state === "logged_in") return { lastLoginAt: { not: null } };
  return {};
}
