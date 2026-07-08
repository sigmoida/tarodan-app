import { Injectable } from '@nestjs/common';
import {
  CreateOrderDto,
  OrderQueryDto,
  UpdateOrderStatusDto,
  CancelOrderDto,
  GuestCheckoutDto,
  GuestOrderTrackDto,
  DirectBuyDto,
  CheckoutQuoteDto,
  GuestSendVerificationCodeDto,
  CheckoutDto,
  GuestCheckoutGroupDto,
} from './dto';
import { OrderPricingService, CommissionResult } from './order-pricing.service';
import { OrderCheckoutService } from './order-checkout.service';
import { OrderQueryService } from './order-query.service';
import { OrderLifecycleService } from './order-lifecycle.service';

export { CommissionResult } from './order-pricing.service';

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

  async getCheckoutQuote(dto: CheckoutQuoteDto): Promise<{
    itemsSubtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    taxAmount: number;
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
    return this.orderPricing.getCheckoutQuote(dto);
  }

  async getCommissionPreview(
    amount: number,
    sellerId: string,
    categoryId?: string | null,
  ): Promise<{
    sellerFeeAmount: number;
    buyerFeeAmount: number;
    commissionAmount: number;
    withholdingTaxAmount: number;
    sellerNetAmount: number;
  }> {
    return this.orderPricing.getCommissionPreview(amount, sellerId, categoryId);
  }

  async getCommissionPreviewBatch(
    sellerId: string,
    items: Array<{ amount: number; categoryId?: string | null }>,
  ): Promise<{ results: Array<{ sellerFeeAmount: number; sellerNetAmount: number }> }> {
    return this.orderPricing.getCommissionPreviewBatch(sellerId, items);
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

  async create(buyerId: string, dto: CreateOrderDto) {
    return this.orderCheckout.create(buyerId, dto);
  }

  async sendGuestCheckoutVerificationCode(dto: GuestSendVerificationCodeDto): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    return this.orderCheckout.sendGuestCheckoutVerificationCode(dto);
  }

  async guestCheckout(dto: GuestCheckoutDto) {
    return this.orderCheckout.guestCheckout(dto);
  }

  // Taşındı: order-query.service.ts — imzalar aynen korunuyor (facade delege).

  async trackGuestOrder(dto: GuestOrderTrackDto) {
    return this.orderQuery.trackGuestOrder(dto);
  }

  async getSellerEarnings(sellerId: string): Promise<{ totalEarnings: number; pendingEarnings: number }> {
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

  async findCheckoutGroup(groupId: string, userId: string) {
    return this.orderQuery.findCheckoutGroup(groupId, userId);
  }

  // Taşındı: order-lifecycle.service.ts — imzalar aynen korunuyor (facade delege).

  async setShippingAddress(
    orderId: string,
    userId: string,
    dto: { fullName: string; phone: string; city: string; district: string; address: string; zipCode?: string },
  ) {
    return this.orderLifecycle.setShippingAddress(orderId, userId, dto);
  }

  async updateStatus(orderId: string, userId: string, dto: UpdateOrderStatusDto) {
    return this.orderLifecycle.updateStatus(orderId, userId, dto);
  }

  async completeOrder(
    orderId: string,
    type: 'manual_ok' | 'auto_timeout' | 'admin_force',
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.completeOrder(orderId, type);
  }

  async confirmReceipt(
    orderId: string,
    userId: string,
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.confirmReceipt(orderId, userId);
  }

  async forceComplete(
    orderId: string,
    adminId: string,
    reason?: string,
  ): Promise<{ completed: boolean }> {
    return this.orderLifecycle.forceComplete(orderId, adminId, reason);
  }

  async extendConfirmation(
    orderId: string,
    adminId: string,
    hours: number,
    reason?: string,
  ): Promise<{ newDeadline: Date }> {
    return this.orderLifecycle.extendConfirmation(orderId, adminId, hours, reason);
  }

  async cancel(orderId: string, userId: string, dto: CancelOrderDto) {
    return this.orderLifecycle.cancel(orderId, userId, dto);
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

  async autoCompleteDeliveredOrder(orderId: string): Promise<{ completed: boolean }> {
    return this.orderLifecycle.autoCompleteDeliveredOrder(orderId);
  }
}
