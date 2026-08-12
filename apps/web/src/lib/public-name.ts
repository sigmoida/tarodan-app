/**
 * Başka bir üyenin adı hep API'nin çözdüğü `publicName` alanından okunur
 * (firma adı → kullanıcı adı → isim zinciri sunucuda kurulur, burada TEKRAR
 * EDİLMEZ). `displayName` aynı değeri taşıyan uyumluluk takma adıdır; eski
 * yanıtlar için yedek olarak durur.
 *
 * Kendi adını gösteren yüzeylerde (profil ayarları, kayıt formu, teslimat
 * adresi) bu yardımcı KULLANILMAZ — orada kişinin gerçek adı görünür.
 */
export type PublicIdentityLike =
  | {
      publicName?: string | null;
      displayName?: string | null;
      username?: string | null;
    }
  | null
  | undefined;

export function publicNameOf(user: PublicIdentityLike, fallback = ""): string {
  return user?.publicName?.trim() || user?.displayName?.trim() || fallback;
}

/** Profil bağlantısı: kullanıcı adı yoksa (legacy hesap) id'ye düşer. */
export function profilePathOf(
  user: (PublicIdentityLike & { id?: string | number }) | null | undefined,
): string | null {
  const handle = user?.username?.trim() || (user?.id ? String(user.id) : "");
  return handle ? `/u/${handle}` : null;
}
