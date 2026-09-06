import { Injectable } from "@nestjs/common";
import { ShippingPackageTierCode } from "@prisma/client";
import {
  OrderQueryDto,
  CancelOrderDto,
  GuestCheckoutDto,
  GuestOrderTrackDto,
  GuestOrderCancelDto,
  DirectBuyDto,
  CheckoutQuoteDto,
  GuestSendVerificationCodeDto,
  CheckoutDto,
  GuestCheckoutGroupDto,
} from "./dto";
import {
  OrderPricingService,
  CommissionResult,
} from "./pricing/order-pricing.service";
import { OrderCheckoutService } from "./checkout/order-checkout.service";
import { OrderQueryService } from "./order-query.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

export { CommissionResult } from "./pricing/order-pricing.service";

/**
 * Facade: tüm public imzalar aynen korunur, iş mantığı alt servislerde
 * (order-pricing / order-checkout / order-query / order-lifecycle +
 * ortak order-common). Dış modüller yalnızca OrderService'i inject etmeye
 * devam eder.
 */
@Injectable()
export class OrderService {
  constructor(
    private readonly orderPricing: OrderPricingService,
    private readonly orderCheckout: OrderCheckoutService,
    private readonly orderQuery: OrderQueryService,
    private readonly orderLifecycle: OrderLifecycleService,
  ) {}

  // Taşındı: order-pricing.service.ts — imzalar aynen korunuyor (facade delege).

  async calculateShippingCost(orderAmount: number): Promise<number> {
    return this.orderPricing.calculateShippingCost(orderAmount);
  }

  async getFreeShippingInfo(orderAmount: number): Promise<{
    isFreeShipping: boolean;
    shippingCost: number;
    threshold: number;
    amountToFreeShipping: number;
  }> {
    return this.orderPricing.getFreeShippingInfo(orderAmount);
  }

  async getCheckoutQuote(
    dto: CheckoutQuoteDto,
    userId: string | null = null,
  ): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
    couponDiscount: number;
    totalAmount: number;
    sellerNetAmount: number;
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      sellerNetAmount: number;
      taxAmount: number;
      title?: string;
    }>;
    pricing: {
      subtotal: number;
      shippingAmount: number;
      buyerFeeAmount: number;
      sellerFeeAmount: number;
      commissionAmount: number;
      taxAmount: number;
      totalAmount: number;
      sellerNetAmount: number;
    };
  }> {
    return this.orderPricing.getCheckoutQuote(dto, userId);
  }

  /**
   * Dönüş tipi fiyatlama servisinden TÜRETİLİR, elle yazılmaz: bu cephe elle
   * listelenmiş daha dar bir şekil taşıdığı için `packageTier` ve
   * `packageTierShipping` eklendiğinde tip onları gizlemeye devam etti — alanlar
   * tele çıkıyordu ama sözleşme "yok" diyordu. Türetmek ikisinin ayrışmasını
   * mümkünsüz kılar.
   */
  async getCommissionPreview(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
    shippingDesi = 1,
  ): Promise<Awaited<ReturnType<OrderPricingService["getCommissionPreview"]>>> {
    return this.orderPricing.getCommissionPreview(
      amount,
      sellerId,
      categoryId,
      shippingDesi,
    );
  }

  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{
      amount: number;
      categoryId?: string | null;
      packageTier?: ShippingPackageTierCode | null;
    }>,
  ): Promise<{
    results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }>;
  }> {
    return this.orderPricing.getCommissionPreviewBatch(sellerId, items);
  }

  async getOrderReview(orderId: string, userId: string) {
    return this.orderQuery.getOrderReview(orderId, userId);
  }

  async calculateCommission(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<CommissionResult> {
    return this.orderPricing.calculateCommission(amount, sellerId, categoryId);
  }

  // Taşındı: order-checkout.service.ts — imzalar aynen korunuyor (facade delege).

  async createDirectOrder(buyerId: string, dto: DirectBuyDto) {
    return this.orderCheckout.createDirectOrder(buyerId, dto);
  }

  async checkout(buyerId: string, dto: CheckoutDto) {
    return this.orderCheckout.checkout(buyerId, dto);
  }

  async checkoutGuest(dto: GuestCheckoutGroupDto) {
    return this.orderCheckout.checkoutGuest(dto);
  }

  // Taşındı: order-checkout.service.ts — unit spec'ler private erişimle çağırdığı
  // için delege korunuyor (imza aynı).
  private createCheckoutGroup(params: {
    buyerId: string;
    dto: CheckoutDto;
    isGuest: boolean;
    guest?: { email: string; phone?: string; name?: string };
  }) {
    return this.orderCheckout.createCheckoutGroup(params);
  }

  async sendGuestCheckoutVerificationCode(
    dto: GuestSendVerificationCodeDto,
  ): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    return this.orderCheckout.sendGuestCheckoutVerificationCode(dto);
  }

  async guestCheckout(dto: GuestCheckoutDto) {
    return this.orderCheckout.guestCheckout(dto);
  }

  // Taşındı: order-query.service.ts — imzalar aynen korunuyor (facade delege).

  async cancelAsGuest(dto: GuestOrderCancelDto) {
    return this.orderLifecycle.cancelAsGuest(dto);
  }

  async trackGuestOrder(dto: GuestOrderTrackDto) {
    return this.orderQuery.trackGuestOrder(dto);
  }

  async getSellerEarnings(
    sellerId: string,
  ): Promise<{ totalEarnings: number; pendingEarnings: number }> {
    return this.orderQuery.getSellerEarnings(sellerId);
  }

  async findUserOrders(userId: string, query: OrderQueryDto) {
    return this.orderQuery.findUserOrders(userId, query);
  }

  async findOne(orderId: string, userId: string) {
    return this.orderQuery.findOne(orderId, userId);
  }

  async findUserCheckoutGroups(userId: string, page = 1, limit = 20) {
    return this.orderQuery.findUserCheckoutGroups(userId, page, limit);
  }

  async findUserOrderGroups(
    userId: string,
    params: {
      role?: "buyer" | "seller";
      tab?: "active" | "cancelled" | "refunds";
      page?: number;
      limit?: number;
    } = {},
  ) {
    return this.orderQuery.findUserOrderGroups(userId, params);
  }

  async findCheckoutGroup(groupId: string, userId: string) {
    return this.orderQuery.findCheckoutGroup(groupId, userId);
  }

  async findGroupViewByOrder(orderId: string, userId: string) {
    return this.orderQuery.findGroupViewByOrder(orderId, userId);
  }

  async getSellerPendingCount(sellerId: string) {
    return this.orderQuery.getSellerPendingCount(sellerId);
  }

  // Taşındı: order-lifecycle.service.ts — imzalar aynen korunuyor (facade delege).

  async setShippingAddress(
    orderId: string,
    userId: string,
    dto: {
      fullName: string;
      phone: string;
      city: string;
      district: string;
      address: string;
      zipCode?: string;
    },
  ) {
    return this.orderLifecycle.setShippingAddress(orderId, userId, dto);
  }

  async completeOrder(
    orderId: string,
    type: "manual_ok" | "auto_timeout",
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.completeOrder(orderId, type);
  }

  async confirmReceipt(
    orderId: string,
    userId: string,
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.confirmReceipt(orderId, userId);
  }

  async cancelGroup(groupId: string, userId: string, dto: CancelOrderDto) {
    return this.orderLifecycle.cancelGroup(groupId, userId, dto);
  }

  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    return this.orderLifecycle.cancel(orderId, userId, dto);
  }

  /** Ödenmemiş siparişin tx içi iptali (admin teklif iptali bunu kullanır). */
  cancelUnpaidOrderInTx(
    ...args: Parameters<OrderLifecycleService["cancelUnpaidOrderInTx"]>
  ) {
    return this.orderLifecycle.cancelUnpaidOrderInTx(...args);
  }

  async invalidateProductCaches(productId: string): Promise<void> {
    return this.orderLifecycle.invalidateProductCaches(productId);
  }

  async reactivate(orderId: string, userId: string) {
    return this.orderLifecycle.reactivate(orderId, userId);
  }

  async markAsPreparing(orderId: string, sellerId: string) {
    return this.orderLifecycle.markAsPreparing(orderId, sellerId);
  }

  async confirmDelivery(orderId: string, buyerId: string) {
    return this.orderLifecycle.confirmDelivery(orderId, buyerId);
  }

  async emitDeliveryRevenueInvoices(orderId: string): Promise<void> {
    return this.orderLifecycle.emitDeliveryRevenueInvoices(orderId);
  }

  async autoCompleteDeliveredOrder(
    orderId: string,
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.autoCompleteDeliveredOrder(orderId);
  }
}
