import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma';
import { ProductStatus, OrderStatus } from '@prisma/client';
import { isPremiumEntitled } from '../membership/membership.util';
import { PaymentService } from '../payment/payment.service';
import { PaymentProvider } from '../payment/dto';
import { BOOST_DURATIONS, BoostPricingOption } from './dto/boost.dto';

/**
 * Boost (öne çıkarma) satın alma akışı.
 *
 * Üyelik satın alma akışını birebir taklit eder: `boost-<boostId>` ön ekli sanal ürün +
 * normal Order + PaymentService.initiatePayment. Ödeme başarıyla tamamlanınca
 * PaymentService callback'i (boost- dalı) ProductBoost'u aktive eder ve ürünü
 * sponsorlu kademesine (rankTier=2) alır.
 */
@Injectable()
export class ProductBoostService {
  private readonly logger = new Logger(ProductBoostService.name);

  // PlatformSetting bulunmazsa kullanılacak varsayılan fiyatlar (TL)
  private readonly DEFAULT_PRICES: Record<number, number> = {
    3: 29,
    7: 59,
    30: 149,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
  ) {}

  private settingKeyFor(durationDays: number): string {
    return `boost_price_${durationDays}d`;
  }

  /** Boost özelliği admin tarafından kapatılmış mı? */
  async isBoostEnabled(): Promise<boolean> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: 'boost_enabled' },
    });
    if (!setting) return true; // varsayılan: açık
    return setting.settingValue !== 'false';
  }

  /** Belirli bir süre için fiyatı döndürür (PlatformSetting → varsayılan). */
  async getPriceForDuration(durationDays: number): Promise<number> {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { settingKey: this.settingKeyFor(durationDays) },
    });
    const parsed = setting?.settingValue ? parseFloat(setting.settingValue) : NaN;
    if (!isNaN(parsed) && parsed >= 0) return parsed;
    return this.DEFAULT_PRICES[durationDays] ?? 0;
  }

  /** Tüm boost süreleri + fiyatları (admin'den ayarlanabilir). */
  async getPricing(): Promise<{ enabled: boolean; options: BoostPricingOption[] }> {
    const enabled = await this.isBoostEnabled();
    const options: BoostPricingOption[] = [];
    for (const durationDays of BOOST_DURATIONS) {
      const price = await this.getPriceForDuration(durationDays);
      options.push({ durationDays, price, label: `${durationDays} gün` });
    }
    return { enabled, options };
  }

  /**
   * Boost satın almayı başlatır: doğrula → ProductBoost(pending) + sanal ürün + Order →
   * ödeme başlat. Ödeme URL'sini döndürür.
   */
  async initiateBoost(
    userId: string,
    productId: string,
    durationDays: number,
    provider: PaymentProvider = PaymentProvider.paytr,
    autoRenew = false,
    req?: Request,
  ) {
    if (!BOOST_DURATIONS.includes(durationDays as any)) {
      throw new BadRequestException('Geçerli bir boost süresi seçiniz (3, 7 veya 30 gün)');
    }

    if (!(await this.isBoostEnabled())) {
      throw new BadRequestException('Öne çıkarma şu anda kullanılamıyor');
    }

    // Ürün + sahiplik + durum doğrula
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true, title: true, categoryId: true },
    });
    if (!product) {
      throw new NotFoundException('Ürün bulunamadı');
    }
    if (product.sellerId !== userId) {
      throw new ForbiddenException('Sadece kendi ilanınızı öne çıkarabilirsiniz');
    }
    if (product.status !== ProductStatus.active) {
      throw new BadRequestException('Sadece aktif (yayında) ilanlar öne çıkarılabilir');
    }

    const price = await this.getPriceForDuration(durationDays);
    if (price <= 0) {
      throw new BadRequestException('Bu süre için geçerli bir fiyat tanımlı değil');
    }

    // Platform satıcısı + varsayılan kategori (sanal ürün için)
    const platformSeller = await this.prisma.user.findFirst({
      where: { email: 'platform@tarodan.com', sellerType: 'platform' },
    });
    if (!platformSeller) {
      throw new NotFoundException('Platform seller bulunamadı');
    }
    const defaultCategory = await this.prisma.category.findFirst({
      where: { isActive: true },
    });
    if (!defaultCategory) {
      throw new NotFoundException('Kategori bulunamadı');
    }

    // Otomatik yenileme yalnızca premium (ücretli, aktif) üyelere
    let effectiveAutoRenew = false;
    if (autoRenew) {
      const membership = await this.prisma.userMembership.findUnique({
        where: { userId },
        select: { status: true, currentPeriodEnd: true, tier: { select: { type: true } } },
      });
      effectiveAutoRenew = isPremiumEntitled(membership);
    }

    // ProductBoost kaydı (pending)
    const boost = await this.prisma.productBoost.create({
      data: {
        productId: product.id,
        userId,
        durationDays,
        price,
        status: 'pending',
        autoRenew: effectiveAutoRenew,
      },
    });

    try {
      // Sanal ürün: boost-<boostId>
      const virtualProductId = `boost-${boost.id}`;
      await this.prisma.product.create({
        data: {
          id: virtualProductId,
          sellerId: platformSeller.id,
          categoryId: defaultCategory.id,
          title: `İlan Öne Çıkarma (${durationDays} gün)`,
          description: `"${product.title}" ilanı için ${durationDays} günlük öne çıkarma`,
          price,
          condition: 'new',
          status: ProductStatus.active,
        },
      });

      const orderNumber = `BOOST-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)
        .toUpperCase()}`;

      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          buyerId: userId,
          sellerId: platformSeller.id,
          productId: virtualProductId,
          totalAmount: price,
          commissionAmount: 0,
          shippingCost: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          shippingAddress: { type: 'boost', boostId: boost.id } as any,
        },
      });

      // Order'ı boost'a bağla (callback orderId ile bulacak)
      await this.prisma.productBoost.update({
        where: { id: boost.id },
        data: { orderId: order.id },
      });

      const paymentResult = await this.paymentService.initiatePayment(
        userId,
        { orderId: order.id, provider },
        req,
      );

      // Ödeme niyeti (intent): kart bilgisi /payments/process-direct ile alınır (iframe yok).
      return {
        boostId: boost.id,
        productId: product.id,
        durationDays,
        price,
        paymentId: paymentResult.paymentId,
        provider: paymentResult.provider,
        expiresIn: paymentResult.expiresIn || 300,
        useBypass: (paymentResult as { useBypass?: boolean }).useBypass === true,
      };
    } catch (error) {
      // Ödeme başlatılamazsa pending boost'u temizle
      await this.prisma.productBoost
        .update({ where: { id: boost.id }, data: { status: 'failed' } })
        .catch(() => {});
      throw error;
    }
  }

  /** Kullanıcının boost'ları (en yeni önce) + ürün özeti. */
  async getMyBoosts(userId: string) {
    const boosts = await this.prisma.productBoost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            status: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    });

    const now = new Date();
    return boosts.map((b) => ({
      id: b.id,
      productId: b.productId,
      product: b.product
        ? {
            id: b.product.id,
            title: b.product.title,
            status: b.product.status,
            image: b.product.images[0]?.cardKey ?? null,
          }
        : null,
      durationDays: b.durationDays,
      price: Number(b.price),
      status: b.status,
      autoRenew: b.autoRenew,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
      isActive: b.status === 'active' && b.endsAt != null && b.endsAt > now,
      remainingMs:
        b.status === 'active' && b.endsAt != null && b.endsAt > now
          ? b.endsAt.getTime() - now.getTime()
          : 0,
      createdAt: b.createdAt.toISOString(),
    }));
  }
}
