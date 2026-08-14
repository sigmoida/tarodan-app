import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ActiveCampaignDto, DiscountResponseDto } from "./dto";
import { DiscountUsageService } from "./discount-usage.service";
import { DiscountCrudService } from "./discount-crud.service";
import { DiscountPricingService } from "./discount-pricing.service";
import { DiscountCouponService } from "./discount-coupon.service";
import { DiscountTradeFeeService } from "./discount-trade-fee.service";
import { resolveUserTier } from "./helpers/user-tier";

/** Kusursuz iadede geri verilen kupon hakkı — commit SONRASI bildirim için. */
export interface RestoredCoupon {
  userId: string;
  /** Yeniden kullanılabilecek kod (kişisel voucher ya da paylaşılan kod). */
  code: string;
  /** Kodun geçerlilik sonu; null = kampanya tarihi geçerli. */
  expiresAt: Date | null;
}

/**
 * İndirim modülünün ön yüzü. Kendi işi yok — çağıranların bildiği imzaları
 * koruyup gövdeyi tek işli servislere devreder: kayıt yönetimi (crud), kupon
 * doğrulama (coupons), kampanya fiyatı (pricing), kullanım defteri (usage) ve
 * takas bedeli kampanyaları (tradeFees).
 */
@Injectable()
export class DiscountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: DiscountUsageService,
    private readonly crud: DiscountCrudService,
    private readonly pricing: DiscountPricingService,
    private readonly coupons: DiscountCouponService,
    private readonly tradeFees: DiscountTradeFeeService,
  ) {}

  // ─────────────────────── kayıt yönetimi (CRUD) ───────────────────────
  // Controller ve admin bu servisi adresliyor; gövde DiscountCrudService'te.

  create(...args: Parameters<DiscountCrudService["create"]>) {
    return this.crud.create(...args);
  }

  update(...args: Parameters<DiscountCrudService["update"]>) {
    return this.crud.update(...args);
  }

  delete(...args: Parameters<DiscountCrudService["delete"]>) {
    return this.crud.delete(...args);
  }

  findOne(...args: Parameters<DiscountCrudService["findOne"]>) {
    return this.crud.findOne(...args);
  }

  findByCode(code: string): Promise<DiscountResponseDto | null> {
    return this.crud.findByCode(code);
  }

  findAll(...args: Parameters<DiscountCrudService["findAll"]>) {
    return this.crud.findAll(...args);
  }

  generateCodes(...args: Parameters<DiscountCrudService["generateCodes"]>) {
    return this.crud.generateCodes(...args);
  }

  listCodes(discountId: string) {
    return this.crud.listCodes(discountId);
  }

  // ────────────────────────── kupon doğrulama ──────────────────────────
  // Sepet önizlemesi ve checkout bu servisi adresliyor; gövde
  // DiscountCouponService'te.

  validateCoupon(...args: Parameters<DiscountCouponService["validateCoupon"]>) {
    return this.coupons.validateCoupon(...args);
  }

  computeCouponDiscount(
    ...args: Parameters<DiscountCouponService["computeCouponDiscount"]>
  ) {
    return this.coupons.computeCouponDiscount(...args);
  }

  resolveUserTier(userId: string): Promise<string | null> {
    return resolveUserTier(this.prisma, userId);
  }

  // ───────────────────────── kullanım defteri ─────────────────────────
  // Checkout, sipariş yaşam döngüsü, ödeme fulfillment/mutabakat, teklif ve
  // iade yolları bu servisi adresliyor; gövde DiscountUsageService'te.

  checkUsageLimit(discountId: string, userId: string): Promise<boolean> {
    return this.usage.checkUsageLimit(discountId, userId);
  }

  reserveUsage(...args: Parameters<DiscountUsageService["reserveUsage"]>) {
    return this.usage.reserveUsage(...args);
  }

  consumeReservedUsageForOrders(
    ...args: Parameters<DiscountUsageService["consumeReservedUsageForOrders"]>
  ) {
    return this.usage.consumeReservedUsageForOrders(...args);
  }

  revokeUsageForOrders(
    ...args: Parameters<DiscountUsageService["revokeUsageForOrders"]>
  ) {
    return this.usage.revokeUsageForOrders(...args);
  }

  releaseReservedUsageForOrders(
    ...args: Parameters<DiscountUsageService["releaseReservedUsageForOrders"]>
  ) {
    return this.usage.releaseReservedUsageForOrders(...args);
  }

  recordUsage(...args: Parameters<DiscountUsageService["recordUsage"]>) {
    return this.usage.recordUsage(...args);
  }

  // ─────────────────── kampanya fiyatı ve vitrini ───────────────────
  // Ürün listesi/detayı, sepet ve kampanya sayfası bu servisi adresliyor;
  // gövde DiscountPricingService'te.

  getEffectiveDisplayPrice(
    ...args: Parameters<DiscountPricingService["getEffectiveDisplayPrice"]>
  ) {
    return this.pricing.getEffectiveDisplayPrice(...args);
  }

  getEffectiveDisplayPriceMany(
    ...args: Parameters<DiscountPricingService["getEffectiveDisplayPriceMany"]>
  ) {
    return this.pricing.getEffectiveDisplayPriceMany(...args);
  }

  quantityDiscountsForLines(
    ...args: Parameters<DiscountPricingService["quantityDiscountsForLines"]>
  ) {
    return this.pricing.quantityDiscountsForLines(...args);
  }

  getActiveDiscountCriteria() {
    return this.pricing.getActiveDiscountCriteria();
  }

  getActiveCampaigns(): Promise<ActiveCampaignDto[]> {
    return this.pricing.getActiveCampaigns();
  }

  getProductDiscounts(
    ...args: Parameters<DiscountPricingService["getProductDiscounts"]>
  ) {
    return this.pricing.getProductDiscounts(...args);
  }

  // ─────────────────── takas bedeli kampanyaları ───────────────────
  // Takas kabulü ve iadesi bu servisi adresliyor; gövde
  // DiscountTradeFeeService'te.

  resolveTradeFeeDiscounts(
    ...args: Parameters<DiscountTradeFeeService["resolveTradeFeeDiscounts"]>
  ) {
    return this.tradeFees.resolveTradeFeeDiscounts(...args);
  }

  spendTradeFeeBudget(
    ...args: Parameters<DiscountTradeFeeService["spendTradeFeeBudget"]>
  ) {
    return this.tradeFees.spendTradeFeeBudget(...args);
  }

  releaseTradeFeeBudget(
    ...args: Parameters<DiscountTradeFeeService["releaseTradeFeeBudget"]>
  ) {
    return this.tradeFees.releaseTradeFeeBudget(...args);
  }
}
