import { ProductStatus } from "@prisma/client";
import { localizedPayloadOf } from "../../i18n";
import {
  isCorporateSellingSuspended,
  type BusinessEntitlementOwner,
  type PremiumCheckMembership,
} from "../../membership/helpers/membership.util";

/**
 * İlan yenileme politikası — saf kararlar (Nest/Prisma kablolaması yok), tek
 * karar yeri. Süresi dolmuş ilanın satıcı yenilemesi, otomatik yenileme ve admin
 * reaktivasyonu aynı yüklemleri kullanır; farklı kapılar farklı yerde yazılırsa
 * bir yol diğerinin atladığı denetimi sessizce atlar.
 */

/** Tek istekte yenilenebilecek en çok ilan (DTO ve servis aynı sabiti kullanır). */
export const MAX_RENEW_BATCH = 100;

/** Satıcının satış yapmasını engelleyen durum (yok = null). */
export type SellerSaleBlock = "banned" | "corporate_suspended";

export interface RenewalSeller extends BusinessEntitlementOwner {
  isBanned?: boolean | null;
  membership?: PremiumCheckMembership | null;
}

/**
 * Banlı satıcı kendi ilanını düzenleyemez; askıdaki kurumsal satıcı (BUSINESS
 * hakkı bitmiş onaylı kurumsal kimlik) satışı yeniden açamaz. ProductUpdateService
 * aynı iki kuralı kendi akışında uygular; yenileme de aynı kaynaktan okur.
 */
export function sellerSaleBlock(
  seller: RenewalSeller | null | undefined,
): SellerSaleBlock | null {
  if (!seller) return null;
  if (seller.isBanned) return "banned";
  if (isCorporateSellingSuspended(seller.membership, seller)) {
    return "corporate_suspended";
  }
  return null;
}

/** Sınırsız (null) ya da pozitif stok satılabilirdir; 0 "aktif ama satılamaz" ilan üretir. */
export function hasSellableStock(quantity: number | null | undefined): boolean {
  return quantity === null || quantity === undefined || quantity > 0;
}

/**
 * `auto_renew` eylemi: ömrü dolan ilan YERİNDE yenilenir — yalnız hâlâ
 * satılabilirse (stokta, satıcı banlı/askıda değil). Aksi hâlde eski davranış
 * (pasife al) uygulanır; yenilenemeyen ilan sessizce yayında tutulmaz.
 */
export function isRenewableInPlace(
  product: { quantity: number | null },
  seller: RenewalSeller | null | undefined,
): boolean {
  return hasSellableStock(product.quantity) && sellerSaleBlock(seller) === null;
}

/** Yenilemenin neden başarısız olduğu: istemcinin yeniden çizebileceği katalog anahtarı. */
export interface RenewalFailure {
  errorKey: string;
  errorParams?: Record<string, unknown>;
  /** true = beklenen bir iş kuralı hatası değil (log/alarm gerektirir). */
  unexpected: boolean;
}

/**
 * Yenileme sırasında fırlayan hatayı tek biçime çevirir (toplu yenileme sonucu
 * ve admin bakım raporu aynı gerekçe şemasını kullanır). Yerelleştirilmiş
 * HttpException anahtarı korunur; diğer her hata genel anahtara düşer.
 */
export function describeRenewalFailure(error: unknown): RenewalFailure {
  const payload = localizedPayloadOf(error);
  if (payload) {
    return {
      errorKey: payload.i18nKey,
      ...(payload.i18nParams
        ? { errorParams: payload.i18nParams as Record<string, unknown> }
        : {}),
      unexpected: false,
    };
  }
  return { errorKey: "server.product.renewFailed", unexpected: true };
}

/**
 * Süresi dolmuş ilanın satıcı yenilemesinin sonucu: içerik son onaydan beri
 * DEĞİŞMEDİYSE doğrudan yayın, aksi hâlde normal onay kuralı (`pending`).
 * Onay izi yoksa (eski kayıt, toplu import) "değişmedi" kanıtlanamaz → `pending`.
 * Moderasyonu gevşetmez: yalnız kanıtlı olarak aynı kalan, daha önce onaylı
 * içerik kuyruğu atlar.
 */
export function resolveRenewalStatus(
  product: { approvedContentFingerprint: string | null },
  currentFingerprint: string,
): typeof ProductStatus.active | typeof ProductStatus.pending {
  return product.approvedContentFingerprint !== null &&
    product.approvedContentFingerprint === currentFingerprint
    ? ProductStatus.active
    : ProductStatus.pending;
}
