import type { Prisma } from "@prisma/client";
import { laneUserWhere, type AccountLane } from "../account-lane/account-lane";
import { excludeIds } from "../user-block/user-block.helpers";

/**
 * Bir viewer'ın koleksiyon keşfindeki kapsamı: engel ilişkisi (simetrik) ve
 * hesap şeridi. Anonim viewer'da gizli kullanıcı yoktur ve şeridi `live`dır.
 */
export interface CollectionViewerScope {
  hiddenUserIds: string[];
  lane: AccountLane;
}

/**
 * Koleksiyon SAHİBİNİN viewer'a görünürlük kuralı — TEK kaynak (S13).
 *
 * Keşif listesi (`/collections/browse`) ve detay (`/collections/:id`,
 * `/collections/slug/:slug`) bu yüklemi kullanır. Eskiden liste yalnız engeli
 * süzüyor, detay ise engel + şerit farkına bakıyordu: test şeridi hesabına
 * canlı koleksiyonlar listeleniyor, detayı 404 veriyordu (App Review 2.1).
 * Ayrıca detay anonim viewer'da şeridi atlıyordu; ürün detayında olduğu gibi
 * anonim viewer canlı şerittir.
 *
 * Sahibin kendisi her zaman geçer: kendini gizli listesinde bulmaz ve kendi
 * şeridindedir. Koleksiyonun gizli (`isPublic=false`) olması ayrı bir kuraldır.
 */
export function collectionOwnerVisibleWhere(
  scope: CollectionViewerScope,
): Prisma.CollectionWhereInput {
  return {
    userId: excludeIds(scope.hiddenUserIds),
    user: laneUserWhere(scope.lane),
  };
}
