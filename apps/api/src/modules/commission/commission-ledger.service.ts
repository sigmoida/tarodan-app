import { Injectable, Logger } from "@nestjs/common";
import { Prisma, CommissionLedgerStatus } from "@prisma/client";
import { PrismaService } from "../../prisma";

export interface UpsertPendingArgs {
  orderId: string;
  sellerCommission: Prisma.Decimal | number;
  buyerFee: Prisma.Decimal | number;
  components?: {
    buyerCommissionAmount: Prisma.Decimal | number;
    buyerPlatformFeeAmount: Prisma.Decimal | number;
    sellerCommissionAmount: Prisma.Decimal | number;
    sellerPlatformFeeAmount: Prisma.Decimal | number;
  };
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class CommissionLedgerService {
  private readonly logger = new Logger(CommissionLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertPending(args: UpsertPendingArgs): Promise<void> {
    const client = args.tx ?? this.prisma;
    const sellerCommission = new Prisma.Decimal(args.sellerCommission as any);
    const buyerFee = new Prisma.Decimal(args.buyerFee as any);
    const total = sellerCommission.add(buyerFee);

    await client.commissionLedger.upsert({
      where: { orderId: args.orderId },
      create: {
        orderId: args.orderId,
        sellerCommission,
        buyerFee,
        totalPlatformRevenue: total,
        buyerCommissionAmount: args.components?.buyerCommissionAmount ?? 0,
        buyerPlatformFeeAmount: args.components?.buyerPlatformFeeAmount ?? 0,
        sellerCommissionAmount: args.components?.sellerCommissionAmount ?? 0,
        sellerPlatformFeeAmount: args.components?.sellerPlatformFeeAmount ?? 0,
        componentBreakdownComplete: args.components != null,
        status: CommissionLedgerStatus.pending,
      },
      update: {},
    });
  }

  async markEarned(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: { orderId, status: CommissionLedgerStatus.pending },
      data: {
        status: CommissionLedgerStatus.earned,
        earnedAt: new Date(),
      },
    });
    return { updated: result.count > 0 };
  }

  async markRefunded(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: {
        orderId,
        status: {
          in: [CommissionLedgerStatus.pending, CommissionLedgerStatus.earned],
        },
      },
      data: {
        status: CommissionLedgerStatus.refunded,
        refundedAt: new Date(),
      },
    });
    return { updated: result.count > 0 };
  }

  /**
   * #88: İade (kısmi veya tam) komisyonu pro-rate eder. `portion` = iade oranı
   * (amountToRefund / siparişTutarı) ∈ [0,1]. refundedSellerCommission/refundedBuyerFee'yi
   * original'in `portion` kadarıyla KÜMÜLATİF artırır (original'e clamp) — böylece tekrarlı
   * kısmi iadeler compound olmaz ve toplamları original'i aşmaz. Kümülatif refunded original'e
   * ulaşınca status=refunded + refundedAt. Original alanlar (sellerCommission/buyerFee/
   * totalPlatformRevenue) DEĞİŞMEZ; net = original - refunded (elogo net faturalar).
   * Idempotent: zaten refunded ise no-op.
   */
  async applyRefund(
    orderId: string,
    portion: number,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean; fullyRefunded: boolean }> {
    const ledger = await tx.commissionLedger.findUnique({
      where: { orderId },
      select: {
        sellerCommission: true,
        buyerFee: true,
        refundedSellerCommission: true,
        refundedBuyerFee: true,
        status: true,
        componentBreakdownComplete: true,
        buyerCommissionAmount: true,
        buyerPlatformFeeAmount: true,
        sellerCommissionAmount: true,
        sellerPlatformFeeAmount: true,
        refundedBuyerCommissionAmount: true,
        refundedBuyerPlatformFeeAmount: true,
        refundedSellerCommissionAmount: true,
        refundedSellerPlatformFeeAmount: true,
      },
    });
    if (!ledger) return { updated: false, fullyRefunded: false };
    if (ledger.status === CommissionLedgerStatus.refunded) {
      return { updated: false, fullyRefunded: true };
    }

    const p = Math.min(Math.max(portion, 0), 1);
    const seller = new Prisma.Decimal(ledger.sellerCommission);
    const buyer = new Prisma.Decimal(ledger.buyerFee);
    const newRefSeller = Prisma.Decimal.min(
      new Prisma.Decimal(ledger.refundedSellerCommission).add(seller.mul(p)),
      seller,
    );
    const newRefBuyer = Prisma.Decimal.min(
      new Prisma.Decimal(ledger.refundedBuyerFee).add(buyer.mul(p)),
      buyer,
    );
    // Kümülatif refunded original'e (0.01 tolerans) ulaştıysa tam iade.
    const fullyRefunded =
      newRefSeller.gte(seller.sub(0.01)) && newRefBuyer.gte(buyer.sub(0.01));
    const proratedComponents = ledger.componentBreakdownComplete
      ? {
          refundedBuyerCommissionAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedBuyerCommissionAmount).add(
              new Prisma.Decimal(ledger.buyerCommissionAmount).mul(p),
            ),
            new Prisma.Decimal(ledger.buyerCommissionAmount),
          ),
          refundedBuyerPlatformFeeAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedBuyerPlatformFeeAmount).add(
              new Prisma.Decimal(ledger.buyerPlatformFeeAmount).mul(p),
            ),
            new Prisma.Decimal(ledger.buyerPlatformFeeAmount),
          ),
          refundedSellerCommissionAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedSellerCommissionAmount).add(
              new Prisma.Decimal(ledger.sellerCommissionAmount).mul(p),
            ),
            new Prisma.Decimal(ledger.sellerCommissionAmount),
          ),
          refundedSellerPlatformFeeAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedSellerPlatformFeeAmount).add(
              new Prisma.Decimal(ledger.sellerPlatformFeeAmount).mul(p),
            ),
            new Prisma.Decimal(ledger.sellerPlatformFeeAmount),
          ),
        }
      : {};

    await tx.commissionLedger.update({
      where: { orderId },
      data: {
        refundedSellerCommission: newRefSeller,
        refundedBuyerFee: newRefBuyer,
        ...proratedComponents,
        ...(fullyRefunded
          ? { status: CommissionLedgerStatus.refunded, refundedAt: new Date() }
          : {}),
      },
    });
    return { updated: true, fullyRefunded };
  }

  /**
   * Politika tabanlı iadede nakit oranı yerine snapshot'taki kesin kesinti
   * tutarlarını uygular. Sipariş fiziksel olarak kapandıysa kalan platform
   * geliri earned olur; tüm kesintiler terslendiyse ledger refunded kapanır.
   */
  async applyRefundAmounts(
    orderId: string,
    amounts: {
      sellerFeeAmount: number;
      buyerFeeAmount: number;
      closeOrder: boolean;
      buyerCommissionAmount?: number;
      buyerPlatformFeeAmount?: number;
      sellerCommissionAmount?: number;
      sellerPlatformFeeAmount?: number;
    },
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean; fullyRefunded: boolean }> {
    const ledger = await tx.commissionLedger.findUnique({
      where: { orderId },
      select: {
        sellerCommission: true,
        buyerFee: true,
        refundedSellerCommission: true,
        refundedBuyerFee: true,
        status: true,
        componentBreakdownComplete: true,
        buyerCommissionAmount: true,
        buyerPlatformFeeAmount: true,
        sellerCommissionAmount: true,
        sellerPlatformFeeAmount: true,
        refundedBuyerCommissionAmount: true,
        refundedBuyerPlatformFeeAmount: true,
        refundedSellerCommissionAmount: true,
        refundedSellerPlatformFeeAmount: true,
      },
    });
    if (!ledger) return { updated: false, fullyRefunded: false };

    const seller = new Prisma.Decimal(ledger.sellerCommission);
    const buyer = new Prisma.Decimal(ledger.buyerFee);
    const newRefSeller = Prisma.Decimal.min(
      new Prisma.Decimal(ledger.refundedSellerCommission).add(
        Math.max(0, amounts.sellerFeeAmount),
      ),
      seller,
    );
    const newRefBuyer = Prisma.Decimal.min(
      new Prisma.Decimal(ledger.refundedBuyerFee).add(
        Math.max(0, amounts.buyerFeeAmount),
      ),
      buyer,
    );
    const fullyRefunded =
      newRefSeller.gte(seller.sub(0.01)) && newRefBuyer.gte(buyer.sub(0.01));
    const shouldEarnRemainder = amounts.closeOrder && !fullyRefunded;
    const componentRefunds = ledger.componentBreakdownComplete
      ? {
          refundedBuyerCommissionAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedBuyerCommissionAmount).add(
              Math.max(0, amounts.buyerCommissionAmount ?? 0),
            ),
            new Prisma.Decimal(ledger.buyerCommissionAmount),
          ),
          refundedBuyerPlatformFeeAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedBuyerPlatformFeeAmount).add(
              Math.max(0, amounts.buyerPlatformFeeAmount ?? 0),
            ),
            new Prisma.Decimal(ledger.buyerPlatformFeeAmount),
          ),
          refundedSellerCommissionAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedSellerCommissionAmount).add(
              Math.max(0, amounts.sellerCommissionAmount ?? 0),
            ),
            new Prisma.Decimal(ledger.sellerCommissionAmount),
          ),
          refundedSellerPlatformFeeAmount: Prisma.Decimal.min(
            new Prisma.Decimal(ledger.refundedSellerPlatformFeeAmount).add(
              Math.max(0, amounts.sellerPlatformFeeAmount ?? 0),
            ),
            new Prisma.Decimal(ledger.sellerPlatformFeeAmount),
          ),
        }
      : {};

    await tx.commissionLedger.update({
      where: { orderId },
      data: {
        refundedSellerCommission: newRefSeller,
        refundedBuyerFee: newRefBuyer,
        ...componentRefunds,
        ...(fullyRefunded
          ? {
              status: CommissionLedgerStatus.refunded,
              refundedAt: new Date(),
            }
          : shouldEarnRemainder &&
              ledger.status === CommissionLedgerStatus.pending
            ? {
                status: CommissionLedgerStatus.earned,
                earnedAt: new Date(),
              }
            : {}),
      },
    });
    return { updated: true, fullyRefunded };
  }

  async markWaived(
    orderId: string,
    reason: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ updated: boolean }> {
    const result = await tx.commissionLedger.updateMany({
      where: { orderId, status: CommissionLedgerStatus.pending },
      data: {
        status: CommissionLedgerStatus.waived,
        waivedAt: new Date(),
        waivedReason: reason,
      },
    });
    return { updated: result.count > 0 };
  }
}
