import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PaymentHoldStatus } from "@prisma/client";
import { CommissionLedgerService } from "../../commission/commission-ledger.service";
import {
  escrowHoldAmountOf,
  type EscrowHoldOrderFields,
} from "../helpers/escrow-hold-amount";

type Money = Prisma.Decimal | number;

/** The paid order `createHold` reads. */
export interface EscrowHoldOrder extends EscrowHoldOrderFields {
  id: string;
  sellerId: string;
  sellerFeeAmount: Money;
  buyerFeeAmount: Money;
  buyerCommissionAmount?: Money | null;
  buyerServiceFeeAmount?: Money | null;
  sellerCommissionAmount?: Money | null;
  sellerPlatformFeeAmount?: Money | null;
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
    order: EscrowHoldOrder,
    paymentId: string,
  ): Promise<void> {
    // The one hold formula (stopaj, service VAT, full shipping, platform-
    // funded discount): `helpers/escrow-hold-amount.ts`.
    const { sellerAmount, shippingDeficit } = escrowHoldAmountOf(order);

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
      components: {
        buyerCommissionAmount: order.buyerCommissionAmount ?? 0,
        buyerPlatformFeeAmount: order.buyerServiceFeeAmount ?? 0,
        sellerCommissionAmount: order.sellerCommissionAmount ?? 0,
        sellerPlatformFeeAmount: order.sellerPlatformFeeAmount ?? 0,
      },
      tx,
    });
  }
}
