import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { ShippingTariffService } from "../shipping/shipping-tariff.service";
import { i18nMessage } from "../i18n";
import {
  buildTradePricing,
  type TradePartyPricing,
  type TradePricingItem,
  type TradeSide,
} from "./trade-pricing.helper";
import { TRADE_PRICING_V2 } from "./trade.constants";

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

@Injectable()
export class TradeQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingTariff: ShippingTariffService,
  ) {}

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
            product: { select: { categoryId: true, shippingDesi: true } },
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
    const [rules, tariff] = await Promise.all([
      this.prisma.commissionRule.findMany({ where: { isActive: true } }),
      this.shippingTariff.getActiveOutboundTariff(),
    ]);

    const items: TradePricingItem[] = trade.items.map((item) => ({
      productId: item.productId,
      side: item.side === "receiver" ? "receiver" : "initiator",
      categoryId: item.product?.categoryId ?? null,
      value: Number(item.valueAtTrade),
      quantity: item.quantity,
      shippingDesi: item.product?.shippingDesi ?? 1,
    }));

    const pricing = buildTradePricing({
      items,
      rules: rules as never,
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
}
