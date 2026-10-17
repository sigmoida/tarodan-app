import type { Prisma } from "@prisma/client";

/** Koleksiyon gizlemenin dokunduğu tablo — silme transaction'ının `tx`'i. */
export type AccountDeletionCollectionsDb = Pick<
  Prisma.TransactionClient,
  "collection"
>;

/**
 * Silinen hesabın herkese açık koleksiyonlarını gizler (hesap silme
 * transaction'ı İÇİNDE çağrılır). Koleksiyon adı/açıklaması kullanıcının
 * kendi içeriğidir; hesap anonimleşirken "Silinmiş Kullanıcı"nın vitrini
 * olarak yayında kalmamalı. Satırlar silinmez (beğeni/görüntülenme kayıtları
 * ve öğeler korunur); mevcut görünürlük alanı `isPublic` kapatılır — keşif,
 * detay ve arama dizini zaten bu alana bakar.
 *
 * Toplu `updateMany` Prisma arama-senkron middleware'ini tetiklemez; dönen
 * kimlikler commit SONRASI dizinden düşürülür.
 *
 * @returns gizlenen koleksiyonların kimlikleri
 */
export async function hideCollectionsForAccountDeletion(
  tx: AccountDeletionCollectionsDb,
  userId: string,
): Promise<string[]> {
  const publicCollections = await tx.collection.findMany({
    where: { userId, isPublic: true },
    select: { id: true },
  });
  if (publicCollections.length === 0) return [];

  const ids = publicCollections.map((collection) => collection.id);
  await tx.collection.updateMany({
    where: { id: { in: ids } },
    data: { isPublic: false },
  });
  return ids;
}
