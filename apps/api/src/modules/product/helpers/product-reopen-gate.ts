import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import type { MembershipService } from "../../membership/membership.service";
import type { CommissionRuleGuardService } from "../../commission/commission-rule-guard.service";

/**
 * Pasif/satılmış bir ilanı yeniden satışa AÇARKEN geçilmesi gereken kapılar —
 * ProductUpdateService'in yeniden açma dalı ile ProductRenewalService'in
 * (süresi dolmuş ilan yenileme) AYNI kaynaktan okuduğu tek yer. Kapıyı iki yerde
 * yazmak bir yolun üyelik limitini ya da komisyon kuralını atlaması demektir.
 *
 *  1. Stok: 0 ise "aktif ama satılamaz" ilan üretilir.
 *  2. Üyelik ilan limiti (create ile AYNI kaynak: canCreateListing). Limit
 *     pending+active+reserved sayar; sold/inactive sayılmaz — kontrolsüz
 *     reaktivasyon limiti aşmanın arka kapısıdır.
 *  3. Kategori+fiyat için aktif komisyon kuralı.
 *
 * Karantina ve süre-dolumu bypass'larında da GEÇERLİDİR: "admin onayı gerekmez"
 * moderasyon içindir; üyelik/komisyon bir güvenlik/finans kapısıdır.
 */
export interface ReopenGateDeps {
  membershipService: Pick<
    MembershipService,
    "canCreateListing" | "getUserLimits"
  >;
  commissionGuard: Pick<CommissionRuleGuardService, "assertListingRuleExists">;
}

export interface ReopenGateProduct {
  sellerId: string;
  categoryId: string;
  price: unknown;
  quantity: number | null;
}

export async function assertListingMayReopen(
  deps: ReopenGateDeps,
  product: ReopenGateProduct,
  /** Aynı istekle gelen yeni stok (varsa); yoksa ilanın mevcut stoğu. */
  requestedQuantity?: number | null,
): Promise<void> {
  const quantity =
    requestedQuantity != null ? Number(requestedQuantity) : product.quantity;
  if (quantity != null && quantity <= 0) {
    throw new BadRequestException(
      i18nMessage("server.product.setQuantityToReopen"),
    );
  }
  const canReopen = await deps.membershipService.canCreateListing(
    product.sellerId,
  );
  if (!canReopen.allowed) {
    const limits = await deps.membershipService.getUserLimits(product.sellerId);
    throw new ForbiddenException(
      i18nMessage("server.product.listingLimitReached", {
        tierName: limits.tierName,
        maxListings: limits.maxTotalListings,
      }),
    );
  }
  await deps.commissionGuard.assertListingRuleExists({
    sellerId: product.sellerId,
    categoryId: product.categoryId,
    amount: Number(product.price),
  });
}
