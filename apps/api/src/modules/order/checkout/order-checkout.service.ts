import { Injectable } from "@nestjs/common";
import {
  GuestCheckoutDto,
  DirectBuyDto,
  GuestSendVerificationCodeDto,
  CheckoutDto,
  GuestCheckoutGroupDto,
} from "../dto";
import { OrderCheckoutDirectService } from "./order-checkout-direct.service";
import { OrderCheckoutGroupService } from "./order-checkout-group.service";
import { OrderGuestCheckoutService } from "./order-guest-checkout.service";

/**
 * Sipariş oluşturma / checkout akışları (buy-now, toplu checkout, teklif→sipariş,
 * misafir checkout + OTP) — ince alt-facade. Her public imza aynen korunur
 * (OrderService buraya delege eder, unit spec'ler bu servisi enjekte eder) ve
 * odaklı alt servislere delege eder: grup dışı satın alma -> direct, toplu grup
 * -> group, misafir + OTP -> guest. Sürat/vergi/komisyon primitifleri
 * OrderCheckoutCommonService'te. DI grafı asiklik: facade -> {direct, group, guest};
 * direct/guest -> group (tek yön); forwardRef yok.
 */
@Injectable()
export class OrderCheckoutService {
  constructor(
    private readonly direct: OrderCheckoutDirectService,
    private readonly group: OrderCheckoutGroupService,
    private readonly guest: OrderGuestCheckoutService,
  ) {}

  async createDirectOrder(buyerId: string, dto: DirectBuyDto) {
    return this.direct.createDirectOrder(buyerId, dto);
  }

  async checkout(buyerId: string, dto: CheckoutDto) {
    return this.direct.checkout(buyerId, dto);
  }

  async checkoutGuest(dto: GuestCheckoutGroupDto) {
    return this.guest.checkoutGuest(dto);
  }

  createCheckoutGroup(params: {
    buyerId: string;
    dto: CheckoutDto;
    isGuest: boolean;
    guest?: { email: string; phone?: string; name?: string };
  }) {
    return this.group.createCheckoutGroup(params);
  }

  async sendGuestCheckoutVerificationCode(
    dto: GuestSendVerificationCodeDto,
  ): Promise<{
    success: boolean;
    expiresInSeconds: number;
  }> {
    return this.guest.sendGuestCheckoutVerificationCode(dto);
  }

  async guestCheckout(dto: GuestCheckoutDto) {
    return this.guest.guestCheckout(dto);
  }
}
