import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DiscountAudience, DiscountTarget, DiscountType } from "@prisma/client";
import { isBuyerFeeTarget, isFeeTarget } from "./fee-discount.engine";
import { i18nMessage } from "../i18n";

/**
 * "Cep kuralı"nın TEK kaynağı: kim neyi indirebilir.
 *
 * Ürünün fiyatı satıcının malıdır, komisyon ve hizmet bedelleri platformun
 * geliridir. Kimse başkasının cebinden indirim veremez. Bu dosya kuralı saf
 * fonksiyonlar olarak tutar; servis ve ileride admin ucu aynı kaynağı çağırır.
 */

/** Ürün fiyatını YALNIZ satıcı, bedelleri YALNIZ platform indirebilir. */
export function assertTargetAllowedForActor(
  target: DiscountTarget,
  isAdmin: boolean,
): void {
  if (target === DiscountTarget.product_price) {
    if (isAdmin) {
      throw new ForbiddenException(
        i18nMessage("server.discount.platformCannotDiscountProduct"),
      );
    }
    return;
  }
  if (!isAdmin) {
    throw new ForbiddenException(
      i18nMessage("server.discount.feeDiscountPlatformOnly"),
    );
  }
}

/**
 * Kuponu ödeme ekranında ALICI yazar; satıcı hiçbir yerde kod girmez. Bu yüzden
 * satıcı tarafındaki bedeller koda bağlanamaz — o avantajlar otomatik ve
 * hedeflidir.
 */
export function assertCodeAllowedForTarget(
  target: DiscountTarget,
  hasCode: boolean,
): void {
  if (!hasCode) return;
  if (isFeeTarget(target) && !isBuyerFeeTarget(target)) {
    throw new BadRequestException(
      i18nMessage("server.discount.sellerFeeNoCoupon"),
    );
  }
  // Takas akışında kod girilecek bir ekran yoktur: kampanya kabul anında
  // kendiliğinden uygulanır (İ25).
  if (target === DiscountTarget.trade_service_fee) {
    throw new BadRequestException(
      i18nMessage("server.discount.tradeFeeNoCoupon"),
    );
  }
}

/**
 * Bedel indirimi doğrudan platform gelirinden çıkar. Kullanım adedi bir maliyet
 * kontrolü değildir (sepet büyüdükçe tutar büyür), bu yüzden TL bütçe zorunludur.
 */
export function assertBudgetForTarget(
  target: DiscountTarget,
  budgetLimit?: number | null,
): void {
  // Takas hizmet bedeli de platform geliridir: aynı TL bütçe şartına tabidir.
  if (!isFeeTarget(target) && target !== DiscountTarget.trade_service_fee) {
    return;
  }
  if (budgetLimit == null || budgetLimit <= 0) {
    throw new BadRequestException(
      i18nMessage("server.discount.feeBudgetRequired"),
    );
  }
}

export interface AudienceInput {
  audience: DiscountAudience;
  target: DiscountTarget;
  tierTypes?: string[] | null;
  userIds?: string[] | null;
}

/** Hedef kitle, hedef kalemin tarafıyla ve verilen listelerle tutarlı olmalıdır. */
export function assertAudienceConsistent(input: AudienceInput): void {
  const { audience, target } = input;
  const tiers = input.tierTypes ?? [];
  const users = input.userIds ?? [];

  if (audience === DiscountAudience.membership_tiers && tiers.length === 0) {
    throw new BadRequestException(i18nMessage("server.discount.tierRequired"));
  }
  if (
    (audience === DiscountAudience.specific_buyers ||
      audience === DiscountAudience.specific_sellers) &&
    users.length === 0
  ) {
    throw new BadRequestException(i18nMessage("server.discount.userRequired"));
  }
  if (audience !== DiscountAudience.membership_tiers && tiers.length > 0) {
    throw new BadRequestException(
      i18nMessage("server.discount.tierAudienceOnly"),
    );
  }
  if (
    audience !== DiscountAudience.specific_buyers &&
    audience !== DiscountAudience.specific_sellers &&
    users.length > 0
  ) {
    throw new BadRequestException(
      i18nMessage("server.discount.userListAudienceOnly"),
    );
  }

  // Taraf tutarlılığı: satıcıya bakan bir kalemi alıcı kitlesine, alıcıya bakan
  // bir kalemi satıcı kitlesine hedeflemek sessizce hiçbir şey indirmezdi.
  const sellerSideTarget = isFeeTarget(target) && !isBuyerFeeTarget(target);
  if (sellerSideTarget) {
    if (
      audience === DiscountAudience.all_buyers ||
      audience === DiscountAudience.specific_buyers
    ) {
      throw new BadRequestException(
        i18nMessage("server.discount.sellerFeeBuyerAudience"),
      );
    }
  } else if (
    audience === DiscountAudience.all_sellers ||
    audience === DiscountAudience.specific_sellers
  ) {
    // Ürün fiyatı ve alıcı bedelleri: satıcı kitlesi hedeflemesi anlamsızdır.
    throw new BadRequestException(
      i18nMessage("server.discount.buyerItemSellerAudience"),
    );
  }
}

/** Bir kampanyanın bu alışverişte hedef kitlesine uyup uymadığı. */
export interface AudienceMatchInput {
  audience: DiscountAudience;
  target: DiscountTarget;
  /** Kampanyanın hedeflediği üyelik katmanları (varsa). */
  tierTypes: string[];
  /** Kampanyanın hedeflediği kullanıcı kimlikleri (varsa). */
  userIds: string[];
  buyerId?: string | null;
  sellerId?: string | null;
  buyerTier?: string | null;
  sellerTier?: string | null;
}

export function audienceMatches(input: AudienceMatchInput): boolean {
  const sellerSideTarget =
    isFeeTarget(input.target) && !isBuyerFeeTarget(input.target);
  // Kalem kimin cebine bakıyorsa kitle o tarafta değerlendirilir.
  const partyId = sellerSideTarget ? input.sellerId : input.buyerId;
  const partyTier = sellerSideTarget ? input.sellerTier : input.buyerTier;

  switch (input.audience) {
    case DiscountAudience.everyone:
      return true;
    case DiscountAudience.all_buyers:
      return !sellerSideTarget;
    case DiscountAudience.all_sellers:
      return sellerSideTarget;
    case DiscountAudience.membership_tiers:
      // Misafirin üyeliği bilinemez → üyelik hedefli kampanya uygulanmaz.
      return partyTier != null && input.tierTypes.includes(partyTier);
    case DiscountAudience.specific_buyers:
    case DiscountAudience.specific_sellers:
      return partyId != null && input.userIds.includes(partyId);
    default:
      return false;
  }
}

/**
 * Satıcının KODSUZ kampanyası kaldırıldı: ilan indirimiyle (çizili fiyat) aynı
 * işi yapıyordu ve arayüz "kodsuz kampanyalar devre dışı" derken motor bunları
 * yine uyguluyordu — iki gerçek kaynak. Satıcının iki aracı kalır: ilan indirimi
 * ve kupon kodu.
 */
export function assertSellerCampaignHasCode(
  target: DiscountTarget,
  isAdmin: boolean,
  hasCode: boolean,
  type?: DiscountType | null,
): void {
  if (isAdmin) return;
  if (target !== DiscountTarget.product_price) return;
  // Adet koşullu türler (bogo / bulk_quantity) BİLİNÇLİ olarak kodsuzdur:
  // "sepete 3. ürün eklendiği anda kendiliğinden uygulanır" (İ3/İ7). Kodsuz
  // yasağının gerekçesi vitrin fiyatını ikinci bir kaynaktan düşüren blanket
  // kampanyalardı; adet kampanyası birim vitrin fiyatına dokunmaz.
  if (type === DiscountType.bogo || type === DiscountType.bulk_quantity) {
    return;
  }
  if (!hasCode) {
    throw new BadRequestException(
      i18nMessage("server.discount.codelessStoreCampaignRemoved"),
    );
  }
}
