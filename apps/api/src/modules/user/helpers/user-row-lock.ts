import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { i18nMessage } from "../../i18n";

/**
 * Hesap silme ile ALICI/takas tarafı yarışını serileştirir.
 *
 * Silme transaction'ı kullanıcı satırını `FOR UPDATE` kilitler
 * (`UserProfileService.deleteAccount`); sipariş, checkout grubu, teklif kabulü
 * ve takas oluşturma/kabul transaction'ları da taraf kullanıcıların satırını
 * `FOR SHARE` kilitler ve silinmiş hesabı reddeder. Böylece ikisi aynı anda
 * koşamaz: silme önce commit olursa işlem silinmiş hesabı görüp düşer, işlem
 * önce commit olursa silme içindeki engel denetimi açık siparişi/takası görür.
 * Aksi hâlde silme, alıcının checkout'u sırasında commit olup anonim alıcıda
 * açık sipariş bırakabilirdi.
 *
 * Kilit sırası tutarlı kalsın diye bu çağrı transaction'ın İLK kilidi olmalı
 * (ürün satırı kilitlerinden önce — silme de önce kullanıcıyı, sonra ilanları
 * kilitler). Kimlikler sıralanıp tek sorguyla kilitlenir (iki taraflı takasta
 * ters sıralı kilit çıkmasın).
 */
export type UserRowLockDb = Pick<Prisma.TransactionClient, "$queryRaw">;

export async function lockActiveUsersShared(
  tx: UserRowLockDb,
  userIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(userIds)].sort();
  if (ids.length === 0) return;
  const rows = await tx.$queryRaw<
    Array<{ id: string; deleted_at: Date | null }>
  >`
    SELECT id, deleted_at FROM users
    WHERE id IN (${Prisma.join(ids)})
    ORDER BY id
    FOR SHARE`;
  if (rows.some((row) => row.deleted_at)) {
    throw new ForbiddenException(i18nMessage("server.auth.accountDeleted"));
  }
}

/** Silme transaction'ının kilidi: eşzamanlı alıcı/takas işlemlerini bekletir. */
export async function lockUserForDeletion(
  tx: UserRowLockDb,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

/**
 * Serialises one user's quota-checked inserts (count, then insert), such as
 * saved searches: two parallel saves cannot both pass the tier limit.
 *
 * `FOR NO KEY UPDATE` conflicts with itself, with the deletion lock
 * (`FOR UPDATE`) and with the buyer and trade lock (`FOR SHARE`), but not with
 * the `FOR KEY SHARE` that any insert referencing the user takes, so unrelated
 * writes are not held up. A deleted account is refused: a save queued behind
 * the deletion must not write after it. Like the others, it must be the
 * transaction's first lock.
 */
export async function lockActiveUserForQuota(
  tx: UserRowLockDb,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ deleted_at: Date | null }>>`
    SELECT deleted_at FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
  if (rows.length === 0) {
    throw new NotFoundException(i18nMessage("server.user.notFound"));
  }
  if (rows[0].deleted_at) {
    throw new ForbiddenException(i18nMessage("server.auth.accountDeleted"));
  }
}
