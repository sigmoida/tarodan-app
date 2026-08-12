import { randomInt } from "crypto";
import type { PrismaService } from "../../prisma";

/**
 * Kullanıcı adı kurallarının TEK kaynağı. Desen ve uzunluk sınırları buradan
 * okunur; DTO'lar (`RegisterDto`, `ClaimUsernameDto`, `CorporateInvitationDto`),
 * servis doğrulamaları ve otomatik üretim aynı tanımı paylaşır. Kuralı burada
 * değiştirmek her yeri değiştirir.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

/**
 * Şifresiz/eski hesaplara veritabanı `generate_legacy_username()` ile
 * `legacy_########` atar (bkz. 20260729180000 migration). Bu önek "kullanıcı
 * adı hiç seçilmedi" demektir: herkese açık gösterimde bu hesaplar kendi
 * `displayName` değerleriyle görünür. Önek gerçek bir kullanıcı tarafından
 * alınabilseydi bu ayrım bozulurdu; bu yüzden `isUsernameAllowed` reddeder.
 */
export const LEGACY_USERNAME_PREFIX = "legacy_";

const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "business",
  "corporate",
  "deleted",
  "guest",
  "help",
  "login",
  "membership",
  "profile",
  "register",
  "seller",
  "support",
  "system",
  "tarodan",
  "www",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

/** Kullanıcı adı seçilmemiş mi? (herkese açık gösterim isme düşer) */
export function isLegacyUsername(value: string | null | undefined): boolean {
  return !value || value.startsWith(LEGACY_USERNAME_PREFIX);
}

export function isUsernameAllowed(value: string): boolean {
  const normalized = normalizeUsername(value);
  return (
    USERNAME_PATTERN.test(normalized) &&
    !RESERVED_USERNAMES.has(normalized) &&
    !normalized.startsWith(LEGACY_USERNAME_PREFIX)
  );
}

/**
 * E-postanın yerel kısmından desene uyan bir taban üretir.
 * `Kaan.Merakli+etiket@gmail.com` → `kaan.merakli.etiket`
 */
export function usernameSeedFromEmail(email: string): string {
  const local = normalizeUsername(email).split("@")[0] ?? "";
  const cleaned = local
    // desen dışı her karakter ayraca dönüşür (boşluk, +, -, unicode…)
    .replace(/[^a-z0-9._]+/g, ".")
    // tekrar eden ayraçları sadeleştir
    .replace(/[._]{2,}/g, ".")
    // baş/son ayraçlar desende yasak
    .replace(/^[._]+|[._]+$/g, "");

  const base = cleaned || "user";
  const padded =
    base.length >= USERNAME_MIN_LENGTH ? base : `${base}user`.slice(0, 8);
  return padded;
}

// Sıralı deneme sayısı: yaygın yerel adlarda (info@, satis@…) tek tek artırmak
// yerine birkaç denemeden sonra rastgele son eke geçiyoruz.
const SEQUENTIAL_ATTEMPTS = 4;
const RANDOM_ATTEMPTS = 12;

function withSuffix(seed: string, suffix: string): string {
  const room = USERNAME_MAX_LENGTH - suffix.length;
  // Son ek eklerken tabanı kırpmak baş/son ayraç bırakabilir; deseni koru.
  const trimmed = seed.slice(0, room).replace(/[._]+$/g, "");
  return `${trimmed || "user"}${suffix}`;
}

/**
 * Google/Apple girişinde ve admin davetinde kullanıcı adı sorulmaz; e-postadan
 * türetilir. Çakışma olursa sayısal son ek denenir. Nihai güvence yine
 * `users_username_key` benzersiz indeksidir.
 */
export async function generateUniqueUsernameFromEmail(
  email: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const seed = usernameSeedFromEmail(email);
  const candidates: string[] = [];
  for (let i = 0; i < SEQUENTIAL_ATTEMPTS; i++) {
    candidates.push(i === 0 ? withSuffix(seed, "") : withSuffix(seed, `${i}`));
  }
  for (let i = 0; i < RANDOM_ATTEMPTS; i++) {
    candidates.push(withSuffix(seed, `${randomInt(1000, 999999)}`));
  }

  for (const candidate of candidates) {
    if (!isUsernameAllowed(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }

  // Buraya düşmek pratikte imkânsız; yine de deterministik bir çıkışımız olsun.
  return withSuffix("user", `${randomInt(100000000, 999999999)}`);
}

/** Prisma'ya bağlı tek kullanım noktası (OAuth girişleri + admin daveti). */
export function allocateUsernameFromEmail(
  prisma: PrismaService,
  email: string,
): Promise<string> {
  return generateUniqueUsernameFromEmail(email, async (candidate) => {
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    return existing !== null;
  });
}
