import { Prisma } from "@prisma/client";
import { isLegacyUsername } from "../../modules/auth/username.util";

/**
 * Herkese açık kimlik: bir üyenin BAŞKA üyelere nasıl göründüğü.
 *
 * Zincir TEK yerde tanımlıdır ve sunucuda çözülür; istemciler hazır `publicName`
 * alanını basar (kural istemciye kopyalanmaz):
 *
 *   1. Kurumsal hesap (companyName dolu)  → firma adı
 *   2. Kullanıcı adı seçilmiş             → username
 *   3. Aksi halde (eski/legacy hesap)     → displayName
 *
 * Gerçek ad (`displayName`) yalnızca kişinin KENDİ yüzeylerinde (profil ayarları,
 * fatura, kargo etiketi, admin paneli) görünür; herkese açık yükte bu alan
 * `publicName` ile aynı değeri taşır — eski istemciler bozulmasın diye alan adı
 * korunur, ama içinde gerçek ad ASLA gitmez.
 */
export const ANONYMOUS_PUBLIC_NAME = "Tarodan Kullanıcısı";

/** Herkese açık bir kullanıcı kartı için gereken minimum Prisma seçimi. */
export const PUBLIC_IDENTITY_SELECT = {
  id: true,
  username: true,
  displayName: true,
  companyName: true,
  avatarUrl: true,
  isVerified: true,
  sellerType: true,
} satisfies Prisma.UserSelect;

/** Ada karar vermek için gereken alanlar (avatar/rozet olmadan). */
export const PUBLIC_NAME_SELECT = {
  username: true,
  displayName: true,
  companyName: true,
} satisfies Prisma.UserSelect;

export type PublicIdentityInput = {
  username?: string | null;
  displayName?: string | null;
  companyName?: string | null;
};

export function publicName(
  user: PublicIdentityInput | null | undefined,
): string {
  if (!user) return ANONYMOUS_PUBLIC_NAME;
  const company = user.companyName?.trim();
  if (company) return company;
  const username = user.username?.trim();
  if (username && !isLegacyUsername(username)) return username;
  return user.displayName?.trim() || ANONYMOUS_PUBLIC_NAME;
}

/**
 * Profil bağlantısı için kullanıcı adı. Legacy yer tutucu (`legacy_########`)
 * bir kimlik değildir; bağlantı id üzerinden kurulsun diye null döner.
 */
export function publicUsername(
  user: PublicIdentityInput | null | undefined,
): string | null {
  const username = user?.username?.trim();
  return username && !isLegacyUsername(username) ? username : null;
}

type PublicIdentityFields = {
  publicName: string;
  displayName: string;
  username: string | null;
};

/**
 * Alanları tek tek yazan serileştiriciler için: ada dair ÜÇ alanın tamamı.
 * `displayName` uyumluluk takma adıdır, `publicName` ile aynı değeri taşır.
 */
export function publicIdentityFields(
  user: PublicIdentityInput | null | undefined,
): PublicIdentityFields {
  const name = publicName(user);
  return {
    publicName: name,
    displayName: name,
    username: publicUsername(user),
  };
}

type PublicIdentityOutput<T> = Omit<T, "displayName" | "companyName"> &
  PublicIdentityFields;

/**
 * Prisma satırını herkese açık yüke çevirir: gerçek ad düşer, `publicName`
 * eklenir, `displayName` uyumluluk için aynı değeri taşır.
 */
export function toPublicIdentity<T extends PublicIdentityInput>(
  user: T,
): PublicIdentityOutput<T>;
export function toPublicIdentity<T extends PublicIdentityInput>(
  user: T | null | undefined,
): PublicIdentityOutput<T> | null;
export function toPublicIdentity<T extends PublicIdentityInput>(
  user: T | null | undefined,
): PublicIdentityOutput<T> | null {
  if (!user) return null;
  const { companyName: _companyName, ...rest } = user;
  return {
    ...(rest as Omit<T, "displayName" | "companyName">),
    ...publicIdentityFields(user),
  };
}
