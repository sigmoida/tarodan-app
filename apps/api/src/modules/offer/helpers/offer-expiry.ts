import { ProductStatus } from "@prisma/client";
import {
  resolveTimingValue,
  type TimingSettingReader,
} from "../../../common/timing-rules";
import type { TimingEnvReader } from "../../../config/timing-env";
import { getAvailableQuantity } from "../../product/helpers/product-availability.helper";

/**
 * Teklif geçerliliğinin bitiş anı: `from` + offerExpiryHours (Süreler ve
 * Kurallar). Yeni teklif/karşı teklif damgası VE extend_once uzatması AYNI
 * fonksiyondan geçer: "bir tam geçerlilik süresi" iki yerde ayrı hesaplanmaz.
 */
export async function offerExpiresAt(
  db: TimingSettingReader,
  env: TimingEnvReader,
  from: Date = new Date(),
): Promise<Date> {
  const hours = await resolveTimingValue(db, "offerExpiryHours", env);
  const expiresAt = new Date(from);
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt;
}

/** Uzatma kararı için teklifin bakılan hâli (zamanlayıcı bir kez okur). */
export interface OfferExtensionCandidate {
  extendedAt: Date | null;
  product: {
    status: ProductStatus;
    quantity: number | null;
    reservedQuantity: number | null;
  } | null;
  buyer: { isBanned: boolean; deletedAt: Date | null } | null;
  seller: { isBanned: boolean; deletedAt: Date | null } | null;
}

/** Teklif neden UZATILAMAZ (null = uzatılabilir). */
export type OfferExtensionBlocker =
  "alreadyExtended" | "listingUnavailable" | "partyUnavailable";

/**
 * extend_once'ın saf uygunluk kuralı. Engel varsa teklif varsayılan davranışla
 * (expire) kapanır: ölü bir ilanın ya da kapalı bir hesabın teklifini canlı
 * tutmak kimsenin işine yaramaz ve kapalı bir pazarlığı yeniden açardı.
 * (Engelleme ayrıca `UserBlockService` ile bakılır — DB okuması gerektirir.)
 */
export function offerExtensionBlocker(
  offer: OfferExtensionCandidate,
): OfferExtensionBlocker | null {
  if (offer.extendedAt) return "alreadyExtended";
  const { product, buyer, seller } = offer;
  if (!product || product.status !== ProductStatus.active) {
    return "listingUnavailable";
  }
  const available = getAvailableQuantity(product);
  if (available !== null && available < 1) return "listingUnavailable";
  for (const party of [buyer, seller]) {
    if (!party || party.isBanned || party.deletedAt) return "partyUnavailable";
  }
  return null;
}
