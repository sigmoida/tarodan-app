import { StorageService } from "../../storage/storage.service";

/**
 * Kullanıcı avatarını istemcinin çağırabileceği bir URL'e çevirir. Zaten mutlak
 * bir adres kayıtlıysa (sosyal sağlayıcıdan gelen) olduğu gibi döner; aksi
 * halde depodaki anahtar için imzalı indirme bağlantısı üretilir.
 *
 * Şifreyle giriş ve sosyal giriş aynı yanıt gövdesini döndürüyor, bu yüzden
 * dönüşüm tek yerde duruyor: biri imzalı URL üretip diğeri ham anahtarı
 * döndürürse istemci hangi girişten geldiğine göre kırık avatar gösterir.
 * İmzalama başarısız olursa avatar yok sayılır — giriş bunun için düşmez.
 */
export async function resolveAvatarUrl(
  storage: StorageService | undefined,
  avatarUrl: string | null | undefined,
): Promise<string | null> {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
    return avatarUrl;
  if (storage) {
    try {
      return await storage.getPresignedDownloadUrl("avatars", avatarUrl, 86400);
    } catch {
      return null;
    }
  }
  return null;
}
