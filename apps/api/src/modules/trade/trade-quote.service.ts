import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  CommissionRuleSetStatus,
  type MembershipTierType,
} from "@prisma/client";
import { PrismaService } from "../../prisma";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { ShippingPackageTiersNotConfiguredError } from "../shipping/shipping-tariff.helper";
import { i18nMessage } from "../i18n";
import {
  buildTradePricing,
  type TradePartyPricing,
  type TradePricing,
  type TradePricingItem,
  type TradeSide,
} from "./trade-pricing.helper";
import { TRADE_PRICING_V2 } from "./trade.constants";
import {
  CommissionRuleMatchError,
  CommissionSellerConfigurationError,
  resolveCommissionSellerType,
} from "../order/order-commission.helper";
import { effectiveMembershipTierType } from "../membership/membership.util";

/**
 * Takas ödeme teklifi (v2) — "bu takas taraflara kaça mal olacak?" sorusunun
 * TEK cevabı.
 *
 * Aynı servis hem ekranları (teklif/karşı teklif/kabul önizlemesi) hem de
 * kabulde yazılacak ödeme satırlarını besler; önizleme ile tahsilat böylece
 * ayrışamaz — sipariş tarafında `buildOrderBreakdown` ile kurulan düzenin aynısı.
 *
 * v1 takaslar (tek taraflı, komisyonlu fark ödemesi) buraya HİÇ girmez: sürüm
 * ayrımı `Trade.pricingVersion` alanında, tek yerde yapılır.
 */

export interface TradePartyQuote extends TradePartyPricing {
  userId: string;
  side: TradeSide;
}

export interface TradeQuote {
  tradeId: string;
  initiator: TradePartyQuote;
  receiver: TradePartyQuote;
}

/** Henüz kaydedilmemiş bir teklifin (karşı teklif düzenleyicisi) fiyatı. */
export interface TradeQuotePreviewInput {
  initiatorItems: Array<{ productId: string; quantity?: number }>;
  receiverItems: Array<{ productId: string; quantity?: number }>;
  cashAmount?: number | null;
  cashPayer?: TradeSide | null;
}

type TradePricingSeller = {
  sellerType: Parameters<
    typeof resolveCommissionSellerType
  >[0]["userSellerType"];
  businessStatus?: string | null;
  companyName?: string | null;
  taxId?: string | null;
  membership?: Parameters<typeof effectiveMembershipTierType>[0];
};

@Injectable()
export class TradeQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingTariff: ShippingTariffService,
  ) {}

  private sellerTypeFor(
    product: { seller?: TradePricingSeller | null } | null | undefined,
  ) {
    const seller = product?.seller;
    if (!seller) {
      throw new CommissionSellerConfigurationError(
        "Trade product seller is missing",
      );
    }
    return resolveCommissionSellerType({
      userSellerType: seller.sellerType,
      membershipTier: effectiveMembershipTierType(seller.membership, seller),
      configuredMembershipTier: seller.membership?.tier?.type as
        MembershipTierType | undefined,
      businessStatus: seller.businessStatus,
      companyName: seller.companyName,
      taxId: seller.taxId,
    });
  }

  private pricingUnavailable(error: unknown): never {
    if (error instanceof ShippingPackageTiersNotConfiguredError) {
      throw new ServiceUnavailableException(
        i18nMessage("server.shipping.noActiveTariff", { provider: "surat" }),
      );
    }
    if (
      error instanceof CommissionRuleMatchError ||
      error instanceof CommissionSellerConfigurationError
    ) {
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }
    throw error;
  }

  /**
   * @returns v2 takas için iki tarafın ödeme dökümü; takas v1 ise `null`
   * (çağıran eski alanları gösterir).
   */
  async quoteForTrade(tradeId: string): Promise<TradeQuote | null> {
    const trade = await this.prisma.trade.findUnique({
      where: { id: tradeId },
      include: {
        items: {
          include: {
            product: {
              select: {
                categoryId: true,
                shippingDesi: true,
                seller: {
                  select: {
                    sellerType: true,
                    businessStatus: true,
                    companyName: true,
                    taxId: true,
                    membership: {
                      select: {
                        status: true,
                        currentPeriodEnd: true,
                        tier: { select: { type: true, isActive: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!trade) {
      throw new NotFoundException(i18nMessage("server.trade.notFound"));
    }
    if (trade.pricingVersion !== TRADE_PRICING_V2) return null;

    // Kurallar ve tarife CANLI okunur: teklif ekranı her zaman güncel fiyatı
    // gösterir. Snapshot kabul anında alınır (ödeme satırlarına yazılır) —
    // sonradan değişen kural devam eden takası etkilemez.
    const [commissionSet, tariff] = await Promise.all([
      this.prisma.commissionRuleSet.findFirst({
        where: { status: CommissionRuleSetStatus.ACTIVE },
        include: { rules: true },
      }),
      this.shippingTariff.getActiveOutboundTariff(),
    ]);
    if (!commissionSet) {
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }

    // Kademe tanımı yoksa takas kargosu fiyatlanamaz. Sessizce 0 yazmak yerine
    // FAIL-CLOSED: checkout'un tarifesiz davranışıyla aynı (503 + net mesaj),
    // aksi halde taraflardan eksik tahsilat yapılır.
    let pricing: ReturnType<typeof buildTradePricing>;
    try {
      const items: TradePricingItem[] = trade.items.map((item) => ({
        productId: item.productId,
        side: item.side === "receiver" ? "receiver" : "initiator",
        categoryId: item.product?.categoryId ?? null,
        sellerType: this.sellerTypeFor(item.product),
        value: Number(item.valueAtTrade),
        quantity: item.quantity,
        shippingDesi: item.product?.shippingDesi ?? 1,
      }));
      pricing = buildTradePricing({
        items,
        rules: commissionSet.rules,
        tariff,
        cash:
          trade.cashAmount && trade.cashPayerId
            ? {
                amount: Number(trade.cashAmount),
                payerSide:
                  trade.cashPayerId === trade.initiatorId
                    ? "initiator"
                    : "receiver",
              }
            : null,
      });
    } catch (error) {
      this.pricingUnavailable(error);
    }

    return {
      tradeId: trade.id,
      initiator: {
        ...pricing.initiator,
        userId: trade.initiatorId,
        side: "initiator",
      },
      receiver: {
        ...pricing.receiver,
        userId: trade.receiverId,
        side: "receiver",
      },
    };
  }

  /**
   * Kaydedilmemiş bir teklifin fiyatı — karşı teklif düzenleyicisi kullanıcı
   * ürün ekleyip çıkardıkça maliyeti gösterebilsin diye. Kabul edilmiş takasla
   * AYNI motoru kullanır; tek fark ürün değerinin `valueAtTrade` yerine güncel
   * ilan fiyatı olmasıdır (teklif henüz snapshot almadı).
   */
  async previewQuote(input: TradeQuotePreviewInput): Promise<TradePricing> {
    const rows = [
      ...input.initiatorItems.map((i) => ({
        ...i,
        side: "initiator" as const,
      })),
      ...input.receiverItems.map((i) => ({ ...i, side: "receiver" as const })),
    ];
    const productIds = [...new Set(rows.map((r) => r.productId))];

    const [products, commissionSet, tariff] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              categoryId: true,
              shippingDesi: true,
              price: true,
              seller: {
                select: {
                  sellerType: true,
                  businessStatus: true,
                  companyName: true,
                  taxId: true,
                  membership: {
                    select: {
                      status: true,
                      currentPeriodEnd: true,
                      tier: { select: { type: true, isActive: true } },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.commissionRuleSet.findFirst({
        where: { status: CommissionRuleSetStatus.ACTIVE },
        include: { rules: true },
      }),
      this.shippingTariff.getActiveOutboundTariff(),
    ]);
    if (!commissionSet) {
      throw new ServiceUnavailableException(
        i18nMessage("server.commission.noRuleConfigured"),
      );
    }
    try {
      const byId = new Map(products.map((product) => [product.id, product]));
      const items: TradePricingItem[] = rows.map((row) => {
        const product = byId.get(row.productId);
        if (!product) {
          throw new NotFoundException(i18nMessage("server.product.notFound"));
        }
        return {
          productId: product.id,
          side: row.side,
          categoryId: product.categoryId ?? null,
          sellerType: this.sellerTypeFor(product),
          value: Number(product.price ?? 0),
          quantity: row.quantity && row.quantity > 0 ? row.quantity : 1,
          shippingDesi: product.shippingDesi ?? 1,
        };
      });
      return buildTradePricing({
        items,
        rules: commissionSet.rules,
        tariff,
        cash:
          input.cashAmount && input.cashAmount > 0
            ? {
                amount: Number(input.cashAmount),
                payerSide:
                  input.cashPayer === "receiver" ? "receiver" : "initiator",
              }
            : null,
      });
    } catch (error) {
      this.pricingUnavailable(error);
    }
  }
}
