/** In-process event: bir kullanıcı diğerini engelledi (admin bildirimi tüketir). */
export const USER_BLOCKED_EVENT = "user.blocked";

export interface UserBlockedPayload {
  blockId: string;
  blockerId: string;
  blockedId: string;
  reason?: string | null;
}

/** Kullanıcı başına gizli-id listesinin cache anahtarı. */
export const blockedCacheKey = (userId: string): string =>
  `user:blocked:${userId}`;

/** Gizli-id listesi cache TTL (saniye). Block/unblock anında invalidate edilir. */
export const BLOCKED_CACHE_TTL_SECONDS = 600;

/** Kötüye kullanım tavanı: bir kullanıcının verebileceği toplam engel sayısı. */
export const MAX_BLOCKS_PER_USER = 1000;
