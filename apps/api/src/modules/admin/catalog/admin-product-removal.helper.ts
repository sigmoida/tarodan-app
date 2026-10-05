import {
  ListingRemovalReason,
  Prisma,
  ProductStatus,
} from "@prisma/client";
import {
  LISTING_REMOVAL_REASONS_BY_ACTOR,
  LISTING_REMOVAL_REASON_FILTER_UNKNOWN,
  LISTING_REMOVED_STATUSES,
  isListingRemovedStatus,
  listingRemovalActorOf,
  type AdminListingRemovalEvent,
  type AdminListingRemovalSummary,
  type ListingRemovalActor,
  type ListingRemovalReasonFilter,
} from "@tarodan/types";

/**
 * Admin ürün listesi/dışa aktarımı: "kaldırma nedeni" ve "kaldıran"
 * filtrelerinin Prisma koşulu. Liste zaten statü sekmesiyle süzüldüğü için
 * parçalar `AND` olarak eklenir — `status` anahtarını EZMEZ.
 *
 * - neden = `unknown`: vitrinden düşmüş (kaldırma statüsü) ama nedeni kaydı
 *   olmayan ilanlar — bu özellikten önce düşenler.
 * - kaldıran: nedenin aktör grubu (satıcı grubu `not_given`ı da kapsar).
 */
export function listingRemovalFilterWhere(filter: {
  removalReason?: ListingRemovalReasonFilter;
  removalActor?: ListingRemovalActor;
}): Prisma.ProductWhereInput[] {
  const parts: Prisma.ProductWhereInput[] = [];
  if (filter.removalReason === LISTING_REMOVAL_REASON_FILTER_UNKNOWN) {
    parts.push({
      removalReason: null,
      status: { in: [...LISTING_REMOVED_STATUSES] as ProductStatus[] },
    });
  } else if (filter.removalReason) {
    parts.push({ removalReason: filter.removalReason });
  }
  if (filter.removalActor) {
    parts.push({
      removalReason: {
        in: [
          ...LISTING_REMOVAL_REASONS_BY_ACTOR[filter.removalActor],
        ] as ListingRemovalReason[],
      },
    });
  }
  return parts;
}

/** Listede ilanın son kaldırmasını okumak için ilişki seçimi (serbest metin YOK). */
export const LATEST_REMOVAL_INCLUDE = {
  orderBy: { createdAt: "desc" },
  take: 1,
  select: {
    reason: true,
    platform: true,
    violationCode: true,
    createdAt: true,
  },
} satisfies Prisma.Product$removalEventsArgs;

/** Admin detayı: kaldırma geçmişi (serbest metin DAHİL — yalnız admin ucu). */
export const REMOVAL_HISTORY_INCLUDE = {
  orderBy: { createdAt: "desc" },
  take: 50,
} satisfies Prisma.Product$removalEventsArgs;

type LatestRemovalRow = {
  reason: ListingRemovalReason;
  platform: string | null;
  violationCode: string | null;
  createdAt: Date;
};

/**
 * İlanın GÜNCEL kaldırma özeti. Vitrindeki ilan → `null`. Kaldırma
 * statüsündeki ilan → `Product.removalReason` (yoksa "bilinmiyor"); platform /
 * ihlal kodu / tarih son olaydan, yalnız o olay güncel nedenle aynıysa
 * (aksi hâlde eski bir kaldırmanın ayrıntısı bugünkü nedene yapışırdı).
 */
export function toAdminRemovalSummary(product: {
  status: ProductStatus;
  removalReason: ListingRemovalReason | null;
  removalEvents?: LatestRemovalRow[];
}): AdminListingRemovalSummary | null {
  if (!isListingRemovedStatus(product.status)) return null;
  const reason = product.removalReason;
  const latest = product.removalEvents?.[0];
  const event = reason && latest?.reason === reason ? latest : undefined;
  return {
    reason,
    actor: reason ? listingRemovalActorOf(reason) : null,
    platform: event?.platform ?? null,
    violationCode: event?.violationCode ?? null,
    removedAt: event?.createdAt.toISOString() ?? null,
  };
}

/** Kaldırma kaydı → admin sözleşmesi (aktör nedenden türetilir). */
export function toAdminRemovalEvent(row: {
  id: string;
  reason: ListingRemovalReason;
  platform: string | null;
  violationCode: string | null;
  detail: string | null;
  statusBefore: ProductStatus;
  statusAfter: ProductStatus;
  actorUserId: string | null;
  createdAt: Date;
}): AdminListingRemovalEvent {
  return {
    id: row.id,
    reason: row.reason,
    actor: listingRemovalActorOf(row.reason),
    platform: row.platform,
    violationCode: row.violationCode,
    detail: row.detail,
    statusBefore: row.statusBefore,
    statusAfter: row.statusAfter,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}
