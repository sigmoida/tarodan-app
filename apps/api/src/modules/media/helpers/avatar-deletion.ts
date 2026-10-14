import type { Prisma } from "@prisma/client";
import type { OutboxService } from "../../outbox/outbox.service";
import {
  OUTBOX_MEDIA_AVATAR_DELETE,
  type MediaAvatarDeletePayload,
} from "../../outbox/outbox.types";

/** Avatar nesnelerinin depolama kökü (yükleme ucu ve URL çözümü ile aynı). */
export const AVATAR_BUCKET = "avatars";

/**
 * `User.avatarUrl` bizim depolamamızdaki bir anahtar mı? Sosyal girişten gelen
 * tam URL (Google/Apple profil resmi) bizim nesnemiz değildir, silinecek bir
 * şey yoktur.
 */
export function avatarStorageKey(
  avatarUrl: string | null | undefined,
): string | null {
  const key = avatarUrl?.trim();
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return null;
  return key;
}

/**
 * Avatar nesnesinin silinmesini outbox'a yazar — çağıranın transaction'ı
 * İÇİNDE. Depolama çağrısı commit SONRASI drainer'dadır (MediaOutboxHandlers);
 * transaction geri alınırsa iş de geri alınır.
 *
 * @returns iş kuyruğa yazıldı mı (depolama anahtarı yoksa yazılmaz)
 */
export async function enqueueAvatarDeletion(
  outbox: Pick<OutboxService, "enqueue">,
  tx: Prisma.TransactionClient,
  avatarUrl: string | null | undefined,
): Promise<boolean> {
  const key = avatarStorageKey(avatarUrl);
  if (!key) return false;
  await outbox.enqueue(tx, {
    type: OUTBOX_MEDIA_AVATAR_DELETE,
    payload: { key } satisfies MediaAvatarDeletePayload,
    dedupeKey: `${OUTBOX_MEDIA_AVATAR_DELETE}:${key}`,
  });
  return true;
}
