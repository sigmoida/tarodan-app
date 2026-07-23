import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import {
  Prisma,
  LedgerEventType,
  LedgerAccount,
  LedgerDirection,
} from "@prisma/client";
import { PrismaService } from "../../prisma";

/** debit → +amount, credit → -amount. Bir grubun signed toplamı 0 olmalı (dengeli). */
function signed(direction: LedgerDirection, amount: number): number {
  return direction === LedgerDirection.debit ? amount : -amount;
}

export interface LedgerEntryInput {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number; // her zaman pozitif
  sellerId?: string | null;
  buyerId?: string | null;
  memo?: string | null;
}

export interface LedgerRecordInput {
  eventType: LedgerEventType;
  currency?: string;
  entries: LedgerEntryInput[];
  refs?: {
    paymentId?: string | null;
    orderId?: string | null;
    tradeId?: string | null;
    payoutId?: string | null;
    holdId?: string | null;
    sellerId?: string | null;
    buyerId?: string | null;
  };
  metadata?: Prisma.InputJsonValue;
}

/** Denge toleransı (kuruş yuvarlaması). */
const BALANCE_EPSILON = 0.005;

/**
 * LedgerService (Faz 6) — DEĞİŞMEZ çift-taraflı defter. `record` DENGELİ bir satır
 * grubu yazar (Σdebit == Σcredit; değilse FIRLATIR — dengesiz kayıt kabul edilmez).
 * Append-only: güncelleme/silme yok. Bir para tx'inin parçası olarak `tx` ile çağrılır.
 *
 * NOT (Faz 6 kapsamı): defter şu an denetim/gözlemlenebilirlik + drift reconciliation
 * (6.5) için popüle edilir; bakiyeleri BURADAN türetip Payment/Hold'u kaynak olmaktan
 * çıkarmak (6.3) ayrı, daha büyük bir geçiştir (para akışlarının deftere taşınması).
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient,
    input: LedgerRecordInput,
  ): Promise<string> {
    if (!input.entries.length) {
      throw new Error("Ledger kaydı en az bir satır ister");
    }
    for (const e of input.entries) {
      if (!(e.amount > 0) || !Number.isFinite(e.amount)) {
        throw new Error(
          `Ledger satır tutarı pozitif olmalı (account=${e.account}, amount=${e.amount})`,
        );
      }
    }
    const net = input.entries.reduce(
      (s, e) => s + signed(e.direction, e.amount),
      0,
    );
    if (Math.abs(net) > BALANCE_EPSILON) {
      throw new Error(
        `Ledger grubu DENGESİZ (Σdebit != Σcredit): net=${net.toFixed(4)} eventType=${input.eventType}`,
      );
    }

    const entryGroupId = crypto.randomUUID();
    const currency = input.currency ?? "TRY";
    const refs = input.refs ?? {};

    await tx.ledgerEntry.createMany({
      data: input.entries.map((e) => ({
        entryGroupId,
        eventType: input.eventType,
        account: e.account,
        direction: e.direction,
        amount: new Prisma.Decimal(e.amount),
        currency,
        paymentId: refs.paymentId ?? null,
        orderId: refs.orderId ?? null,
        tradeId: refs.tradeId ?? null,
        payoutId: refs.payoutId ?? null,
        holdId: refs.holdId ?? null,
        sellerId: e.sellerId ?? refs.sellerId ?? null,
        buyerId: e.buyerId ?? refs.buyerId ?? null,
        memo: e.memo ?? null,
        metadata: input.metadata,
      })),
    });
    return entryGroupId;
  }

  /**
   * Alıcı ödemesi yakalandı: dış giriş (buyer_payment) = escrow (seller_escrow) +
   * platform komisyonu + stopaj (withholding_tax). gross = sellerNet + commission +
   * withholdingTax → grup dengeli. sellerNet çağırandan alınır (hold tutarıyla birebir).
   */
  async recordCapture(
    tx: Prisma.TransactionClient,
    input: {
      paymentId?: string | null;
      orderId?: string | null;
      buyerId?: string | null;
      sellerId?: string | null;
      gross: number;
      sellerNet: number;
      commission: number;
      withholdingTax?: number;
      currency?: string;
      memo?: string | null;
    },
  ): Promise<string> {
    const entries: LedgerEntryInput[] = [
      {
        account: LedgerAccount.buyer_payment,
        direction: LedgerDirection.credit,
        amount: input.gross,
      },
      {
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.debit,
        amount: input.sellerNet,
      },
    ];
    if (input.commission > 0) {
      entries.push({
        account: LedgerAccount.platform_commission,
        direction: LedgerDirection.debit,
        amount: input.commission,
      });
    }
    if (input.withholdingTax && input.withholdingTax > 0) {
      entries.push({
        account: LedgerAccount.withholding_tax,
        direction: LedgerDirection.debit,
        amount: input.withholdingTax,
      });
    }
    return this.record(tx, {
      eventType: LedgerEventType.payment_captured,
      currency: input.currency,
      entries,
      refs: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
      },
      metadata: input.memo ? { memo: input.memo } : undefined,
    });
  }

  /** Bir hesabın signed (debit +, credit −) bakiyesi. Test/teşhis/gelecekteki türetim. */
  async accountBalance(
    account: LedgerAccount,
    where?: { sellerId?: string; orderId?: string },
  ): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { account, ...(where ?? {}) },
      _sum: { amount: true },
    });
    let bal = 0;
    for (const r of rows) {
      const sum = Number(r._sum.amount ?? 0);
      bal += r.direction === LedgerDirection.debit ? sum : -sum;
    }
    return Number(bal.toFixed(2));
  }
}
