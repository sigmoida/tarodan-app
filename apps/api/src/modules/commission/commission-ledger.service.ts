import { Injectable, Logger } from '@nestjs/common';
import { Prisma, CommissionLedgerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';

export interface UpsertPendingArgs {
  orderId: string;
  sellerCommission: Prisma.Decimal | number;
  buyerFee: Prisma.Decimal | number;
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
        status: { in: [CommissionLedgerStatus.pending, CommissionLedgerStatus.earned] },
      },
      data: {
        status: CommissionLedgerStatus.refunded,
        refundedAt: new Date(),
      },
    });
    return { updated: result.count > 0 };
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
