import { Request, Response } from 'express';

/**
 * httpOnly cookie tabanlı auth.
 *
 * Tokenlar artık tarayıcıda localStorage'da DEĞİL, backend'in set ettiği httpOnly
 * cookie'lerde tutulur (XSS'e karşı). Mobil hâlâ Authorization header ile çalışır;
 * bu yüzden login/refresh yanıtları token'ı JSON body'de döndürmeye devam eder,
 * ek olarak da burada cookie set edilir.
 *
 * Cookie isimleri kullanıcı/admin için ayrıdır (aynı API host'unda çakışmasın):
 *  - kullanıcı: access_token / refresh_token
 *  - admin:     admin_token / admin_refresh_token  (admin middleware bu adı bilir)
 */

export const COOKIE_NAMES = {
  user: { access: 'access_token', refresh: 'refresh_token' },
  admin: { access: 'admin_token', refresh: 'admin_refresh_token' },
} as const;

/** "30m" | "7d" | "15m" | "1h" | "900s" gibi süreyi ms'e çevirir. */
export function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!m) {
    const asNum = Number(value);
    return Number.isFinite(asNum) ? asNum * 1000 : fallbackMs;
  }
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function ttls(admin: boolean) {
  if (admin) {
    return {
      access: parseDurationMs(process.env.ADMIN_JWT_EXPIRES_IN, 30 * 60_000),
      refresh: parseDurationMs(process.env.ADMIN_JWT_REFRESH_EXPIRES_IN, 7 * 86_400_000),
    };
  }
  return {
    access: parseDurationMs(process.env.JWT_EXPIRES_IN, 15 * 60_000),
    refresh: parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, 7 * 86_400_000),
  };
}

function baseCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const domain = process.env.COOKIE_DOMAIN || undefined;
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    ...(domain ? { domain } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  opts: { admin: boolean },
): void {
  const names = opts.admin ? COOKIE_NAMES.admin : COOKIE_NAMES.user;
  const t = ttls(opts.admin);
  const base = baseCookieOptions();
  res.cookie(names.access, tokens.accessToken, { ...base, maxAge: t.access });
  res.cookie(names.refresh, tokens.refreshToken, { ...base, maxAge: t.refresh });
}

export function clearAuthCookies(res: Response, opts: { admin: boolean }): void {
  const names = opts.admin ? COOKIE_NAMES.admin : COOKIE_NAMES.user;
  const base = baseCookieOptions();
  // clearCookie, maxAge dışındaki attribute'lar (path/domain/sameSite) eşleşmeli.
  res.clearCookie(names.access, base);
  res.clearCookie(names.refresh, base);
}

/** Raw Cookie header'ını ayrıştırır (cookie-parser bağımlılığına gerek yok). */
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** İstekten verilen cookie isimlerinden ilk bulunanı döndürür (passport extractor için). */
export function readCookie(req: Request, names: string[]): string | null {
  // cookie-parser kuruluysa req.cookies dolu olur; değilse header'dan ayrıştır.
  const fromParser = (req as Request & { cookies?: Record<string, string> }).cookies;
  const jar = fromParser && Object.keys(fromParser).length > 0
    ? fromParser
    : parseCookieHeader(req.headers?.cookie);
  for (const name of names) {
    if (jar[name]) return jar[name];
  }
  return null;
}
