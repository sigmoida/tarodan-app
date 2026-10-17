import { ForbiddenException } from "@nestjs/common";
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
