import { Injectable, Logger } from "@nestjs/common";
import { Prisma, PaymentHoldStatus } from "@prisma/client";
import { CommissionLedgerService } from "../commission/commission-ledger.service";

/**
 * EscrowHoldService (Faz 8.2) — bir ödenmiş fiziksel siparişin escrow HOLD'unu ve
 * pending komisyon defter satırını oluşturur. Tekil ve grup fulfillment yollarında
 * BİREBİR aynı olan mantığı tek yere alır (god-service dedup).
 *
 * KRİTİK: para tx'inin İÇİNDE çağrılır (caller'ın `tx`'i geçer) → hold + komisyon,
 * ödeme tamamlama ile ATOMİK. sellerAmount = total − komisyon − stopaj (payout'a giren
 * net). releaseAt ödeme anında NULL: teslimde (deliveredAt + return + grace) hesaplanır;
 * teslim olmadan asla serbest bırakılmaz.
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
    const sellerAmount =
      Number(order.totalAmount) -
      Number(order.commissionAmount) -
      Number(order.withholdingTaxAmount ?? 0);

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

    // CommissionLedger satırı — pending (Faz 3A.2).
    await this.commissionLedger.upsertPending({
      orderId: order.id,
      sellerCommission: order.sellerFeeAmount,
      buyerFee: order.buyerFeeAmount,
      tx,
    });
  }
}
