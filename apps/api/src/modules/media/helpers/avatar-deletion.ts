import type { Prisma } from "@prisma/client";
import type { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_MEDIA_AVATAR_DELETE,
  type MediaAvatarDeletePayload,
} from "../../outbox/outbox.types";

/** Avatar nesnelerinin depolama kökü (yükleme ucu ve URL çözümü ile aynı). */
export const AVATAR_BUCKET = "avatars";

/** Tam URL'den bizim public nesne anahtarımızı çıkarır (`StorageService`). */
export type PublicAssetKeyResolver = (url: string) => string | null;

/**
 * `User.avatarUrl`'in bizim depolamamızdaki anahtarı. Değer çıplak anahtar
 * olabilir ya da yükleme ucunun döndürdüğü public tam URL (avatars public
 * köktedir); ikincisi `resolvePublicUrl` ile anahtara çevrilir. Sosyal
 * girişten gelen URL (Google/Apple profil resmi) bizim nesnemiz değildir:
 * çözücü onu tanımaz, silinecek bir şey yoktur.
 */
export function avatarStorageKey(
  avatarUrl: string | null | undefined,
  resolvePublicUrl?: PublicAssetKeyResolver,
): string | null {
  const value = avatarUrl?.trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return resolvePublicUrl?.(value) ?? null;
  }
  return value;
}

/**
 * Avatar nesnesinin silinmesini outbox'a yazar — çağıranın transaction'ı
 * İÇİNDE. Depolama çağrısı commit SONRASI drainer'dadır (MediaOutboxHandlers);
 * transaction geri alınırsa iş de geri alınır. Payload yalnız depolama
 * anahtarını taşır; URL (sosyal sağlayıcınınki dahil) outbox'a yazılmaz.
 *
 * @returns iş kuyruğa yazıldı mı (bizim nesnemiz yoksa yazılmaz)
 */
export async function enqueueAvatarDeletion(
  outbox: Pick<OutboxService, "enqueue">,
  tx: Prisma.TransactionClient,
  avatarUrl: string | null | undefined,
  resolvePublicUrl?: PublicAssetKeyResolver,
): Promise<boolean> {
  const key = avatarStorageKey(avatarUrl, resolvePublicUrl);
  if (!key) return false;
  await outbox.enqueue(tx, {
    type: OUTBOX_MEDIA_AVATAR_DELETE,
    payload: { key } satisfies MediaAvatarDeletePayload,
    dedupeKey: `${OUTBOX_MEDIA_AVATAR_DELETE}:${key}`,
  });
  return true;
}
