import { Injectable, Logger, Optional } from "@nestjs/common";
import { LedgerEventType } from "@prisma/client";
import { PrismaService } from "../../prisma";
import { EventService } from "../events";
import { PaymentCommonService } from "./payment-common.service";
import { LedgerService } from "../ledger/ledger.service";

/**
 * FulfillmentFinalizer (Faz 8.2) — FİZİKSEL (üyelik/boost olmayan) bir ödenmiş
 * siparişin POST-COMMIT sonlandırması. Tekil ve grup fulfillment yollarında BİREBİR
 * aynı olan üç adımı tek yere alır (god-service dedup): (1) çift-taraflı defter
 * yakalaması, (2) order.paid event'i (misafir tespiti dahil), (3) Sürat gönderi kaydı.
 *
 * TÜM adımlar best-effort — hata loglanır, ödemeyi/akışı BOZMAZ (ödeme zaten commit'li).
 */
@Injectable()
export class FulfillmentFinalizer {
  private readonly logger = new Logger(FulfillmentFinalizer.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: EventService,
    private readonly paymentCommon: PaymentCommonService,
    @Optional() private readonly ledger?: LedgerService,
  ) {}

  async finalizePaidOrder(
    order: any,
    payment: any,
    opts: { skipBuyer?: boolean; transactionId?: string } = {},
  ): Promise<void> {
    const transactionId =
      opts.transactionId || payment.providerPaymentId || payment.id;

    // 1) Ledger capture (best-effort; defter hatası ödemeyi bozmaz — reconciliation yakalar).
    // #8 İDEMPOTENCY: ledger.record her çağrıda yeni entryGroup yazar (idempotent DEĞİL).
    // finalize iki kez koşabildiği için (anlık yol + outbox backstop / drainer retry) önce
    // bu sipariş için `payment_captured` grubu VAR MI diye bak — varsa yakalamayı ATLA
    // (çift capture defter read-model'ini bozar). Kargo/order.paid adımları kendi
    // idempotency'lerine sahip; yalnız ledger'ın açık koruması burada.
    try {
      const already = await this.prisma.ledgerEntry.findFirst({
        where: {
          orderId: order.id,
          eventType: LedgerEventType.payment_captured,
        },
        select: { id: true },
      });
      if (already) {
        this.logger.log(
          `Ledger capture zaten kayıtlı (order ${order.id}) — çift kayıt atlandı`,
        );
      } else {
        const gross = Number(order.totalAmount);
        const commission = Number(order.commissionAmount);
        const withholdingTax = Number(order.withholdingTaxAmount ?? 0);
        await this.ledger?.recordCapture(this.prisma, {
          paymentId: payment.id,
          orderId: order.id,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
          gross,
          sellerNet: Number((gross - commission - withholdingTax).toFixed(2)),
          commission,
          withholdingTax,
        });
      }
    } catch (e: any) {
      this.logger.warn(
        `Ledger capture kaydı başarısız (order ${order.id}): ${e?.message}`,
      );
    }

    // 2) order.paid event (misafir tespiti dahil).
    try {
      const shippingAddressData = order.shippingAddress as any;
      const isGuestOrder =
        order.buyer.email === "guest@tarodan.system" ||
        shippingAddressData?.isGuestOrder;
      const actualBuyerEmail = isGuestOrder
        ? shippingAddressData?.guestEmail ||
          shippingAddressData?.email ||
          order.buyer.email
        : order.buyer.email;
      const actualBuyerName = isGuestOrder
        ? shippingAddressData?.guestName ||
          shippingAddressData?.fullName ||
          "Misafir Müşteri"
        : order.buyer.displayName || order.buyer.email;

      await this.eventService.emitOrderPaid({
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        productId: order.productId,
        productTitle: order.product.title,
        totalAmount: Number(order.totalAmount),
        // Çoklu-adet: e-postada "Ürün × N" gösterimi için adet + birim fiyat.
        quantity: Number(order.quantity ?? 1),
        unitPrice:
          order.unitPrice != null ? Number(order.unitPrice) : undefined,
        commissionAmount: Number(order.commissionAmount),
        buyerEmail: actualBuyerEmail,
        buyerName: actualBuyerName,
        sellerEmail: order.seller.email,
        sellerName: order.seller.displayName || order.seller.email,
        paymentMethod: payment.provider,
        transactionId,
        shippingAddress: {
          fullName: shippingAddressData?.fullName || "",
          phone: shippingAddressData?.phone || "",
          address: shippingAddressData?.address || "",
          city: shippingAddressData?.city || "",
          district: shippingAddressData?.district || "",
          zipCode: shippingAddressData?.zipCode || "",
        },
        isGuestOrder,
        buyerSystemEmail: order.buyer.email || "",
        // Sepet: alıcı onayı grup başına TEK kez (emitGroupBuyerOrderPaid) → burada atla.
        skipBuyer: opts.skipBuyer,
      });
    } catch (error) {
      this.logger.error(`Failed to emit order.paid event: ${error}`);
    }

    // 3) Sürat gönderi kaydı (create + H4 cancelled-revive; PaymentCommonService).
    try {
      await this.paymentCommon.ensureSuratShipmentForOrder(order.id);
    } catch (error) {
      this.logger.error(
        `Failed to auto-create shipment for order ${order.orderNumber}: ${error}`,
      );
    }
  }

  /**
   * Faz 6.4: Takas nakit-farkı yakalamasını birleşik gelir defterine yaz (takas komisyonu
   * da `platform_commission` hesabına düşsün). POST-COMMIT best-effort — defter hatası
   * ödemeyi bozmaz; reconciliation açığı yakalar.
   */
  async recordTradeCashCapture(tradeCashPaymentId: string): Promise<void> {
    if (!this.ledger) return;
    try {
      const tcp = await this.prisma.tradeCashPayment.findUnique({
        where: { id: tradeCashPaymentId },
        select: {
          tradeId: true,
          payerId: true,
          recipientId: true,
          amount: true,
          commission: true,
          totalAmount: true,
        },
      });
      if (!tcp) return;
      await this.ledger.recordTradeCashCapture(this.prisma, {
        tradeId: tcp.tradeId,
        tradeCashPaymentId,
        payerId: tcp.payerId,
        recipientId: tcp.recipientId,
        totalAmount: Number(tcp.totalAmount),
        netAmount: Number(tcp.amount),
        commission: Number(tcp.commission),
      });
    } catch (e: any) {
      this.logger.warn(
        `Ledger trade-cash capture kaydı başarısız (tcp ${tradeCashPaymentId}): ${e?.message}`,
      );
    }
  }
}
