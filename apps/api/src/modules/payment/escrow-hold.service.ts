import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PaymentHoldStatus } from "@prisma/client";
import { CommissionLedgerService } from "../commission/commission-ledger.service";

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Bir siparişin TAM kargo bedeli (alıcı payı + satıcı payı). Pay kolonları
 * yazılmamış eski/dolaylı yollarda legacy `shippingCost` (alıcıdan tahsil edilen)
 * tam bedel kabul edilir; kargosuz (üyelik/dijital) siparişte 0.
 */
function fullShippingAmountOf(order: {
  buyerShippingAmount?: unknown;
  sellerShippingAmount?: unknown;
  shippingCost?: unknown;
}): number {
  const buyer = Number(order.buyerShippingAmount ?? 0);
  const seller = Number(order.sellerShippingAmount ?? 0);
  if (buyer > 0 || seller > 0) return buyer + seller;
  return Number(order.shippingCost ?? 0);
}

/**
 * EscrowHoldService (Faz 8.2) — bir ödenmiş fiziksel siparişin escrow HOLD'unu ve
 * pending komisyon defter satırını oluşturur. Tekil ve grup fulfillment yollarında
 * BİREBİR aynı olan mantığı tek yere alır (god-service dedup).
 *
 * KRİTİK: para tx'inin İÇİNDE çağrılır (caller'ın `tx`'i geçer) → hold + komisyon,
 * ödeme tamamlama ile ATOMİK. releaseAt ödeme anında NULL: teslimde (deliveredAt +
 * return + grace) hesaplanır; teslim olmadan asla serbest bırakılmaz.
 *
 * sellerAmount = total − komisyon − stopaj − TAM kargo (+ platform-fonlu indirim).
 * Sürat faturası PLATFORMA gelir: alıcının ödediği kargo payı satıcıya geçmez,
 * satıcının payı da burada kesilir — ikisi platformda kalıp taşıyıcı maliyetini
 * karşılar. Grup sepetinde kargo satıcının İLK satırına yüklendiğinden küçük
 * tutarlı bir ilk satır negatife düşebilir; hold 0'a sabitlenir ve açık,
 * `shipping_deficit` borcu olarak payout mahsubuna yazılır.
 */
@Injectable()
export class EscrowHoldService {
  private readonly logger = new Logger(EscrowHoldService.name);

  constructor(private readonly commissionLedger: CommissionLedgerService) {}

  async createHold(
    tx: Prisma.TransactionClient,
    order: any,
    paymentId: string,
  ): Promise<void> {
    // Stopaj (GVK 94/19) yalnız kurumsal satıcı siparişlerinde > 0; hold'dan düşülür,
    // payout'a hiç girmez (platform muhtasar ile beyan eder, satıcı beyannamede mahsup).
    const rawSellerAmount = round2(
      Number(order.totalAmount) -
        Number(order.commissionAmount) -
        Number(order.withholdingTaxAmount ?? 0) -
        fullShippingAmountOf(order) +
        // F2.4: platform-fonlu kampanya payı satıcıya GERİ eklenir — satıcı indirim
        // öncesi tutar üzerinden ödenir, farkı platform üstlenir. Satıcı-fonlu (varsayılan)
        // kuponlarda bu 0'dır → mevcut davranış değişmez.
        Number(order.platformFundedDiscount ?? 0),
    );
    const sellerAmount = Math.max(0, rawSellerAmount);
    const shippingDeficit = round2(Math.max(0, -rawSellerAmount));

    await tx.paymentHold.create({
      data: {
        paymentId,
        orderId: order.id,
        sellerId: order.sellerId,
        amount: sellerAmount,
        status: PaymentHoldStatus.held,
        releaseAt: null,
      },
    });

    if (shippingDeficit > 0) {
      // Idempotent (sourceKey unique): fulfillment tekrarında borç ikilenmez.
      await tx.sellerAccountAdjustment.upsert({
        where: { sourceKey: `shipping-deficit:${order.id}` },
        create: {
          sellerId: order.sellerId,
          orderId: order.id,
          sourceKey: `shipping-deficit:${order.id}`,
          type: "shipping_deficit",
          amount: shippingDeficit,
          remainingAmount: shippingDeficit,
          metadata: { paymentId },
        },
        update: {},
      });
      this.logger.warn(
        `Order ${order.id}: hold could not cover the shipping deduction; ` +
          `booked ${shippingDeficit} as a shipping_deficit adjustment for seller ${order.sellerId}`,
      );
    }

    // CommissionLedger satırı — pending (Faz 3A.2).
    await this.commissionLedger.upsertPending({
      orderId: order.id,
      sellerCommission: order.sellerFeeAmount,
      buyerFee: order.buyerFeeAmount,
      tx,
    });
  }
}
