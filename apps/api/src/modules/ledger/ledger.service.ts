import { Injectable } from "@nestjs/common";
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
  /**
   * İş olayı başına DETERMİNİSTİK anahtar (ör. `capture:order:<id>`). Grubun tüm
   * satırlarına damgalanır; (idempotencyKey, lineNo) UNIQUE olduğu için aynı olayın
   * ikinci yazımı DB'de P2002 ile düşer. Verilmezse koruma YOKTUR (eski davranış).
   *
   * UYARI: çağrı bir transaction İÇİNDEYSE P2002 tüm transaction'ı düşürür (Postgres
   * hatalı statement sonrası tx'i abort eder). Bu istenen davranıştır — çift yazım
   * girişimi zaten çift işlenen bir para olayının belirtisidir.
   */
  idempotencyKey?: string | null;
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

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * LedgerService (Faz 6) — DEĞİŞMEZ çift-taraflı defter. `record` DENGELİ bir satır
 * grubu yazar (Σdebit == Σcredit; değilse FIRLATIR — dengesiz kayıt kabul edilmez).
 * Bir para tx'inin parçası olarak `tx` ile çağrılır.
 *
 * Append-only YALNIZ kod disiplini değil: `ledger_entries` üzerinde UPDATE/DELETE
 * DB tetikleyicisiyle reddedilir (düzeltme = ters kayıt). Çift yazıma karşı da DB
 * koruması vardır — bkz. `idempotencyKey`.
 *
 * NOT (Faz 6 kapsamı): defter şu an denetim/gözlemlenebilirlik + drift reconciliation
 * (6.5) için popüle edilir; bakiyeleri BURADAN türetip Payment/Hold'u kaynak olmaktan
 * çıkarmak (6.3) ayrı, daha büyük bir geçiştir (para akışlarının deftere taşınması).
 */
@Injectable()
export class LedgerService {
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

    // Tek `createMany` → grup ya tamamen yazılır ya hiç. `lineNo` grup içi sıra
    // numarasıdır; unique index'in ikinci ayağı olduğundan hesap/yön hakkında
    // hiçbir varsayım yapmadan çift yazımı engeller.
    await tx.ledgerEntry.createMany({
      data: input.entries.map((e, lineNo) => ({
        idempotencyKey: input.idempotencyKey ?? null,
        lineNo,
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
      // Sipariş başına TEK capture: finalize iki kez koşsa da (anlık yol + outbox
      // backstop) ikinci yazım DB'de düşer.
      idempotencyKey: input.orderId
        ? `capture:order:${input.orderId}`
        : input.paymentId
          ? `capture:payment:${input.paymentId}`
          : null,
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

  /**
   * Takas ödemesi yakalaması (Faz 6.4 — birleşik gelir defteri). Bir TARAFIN ödediği
   * `totalAmount` üç yere dağılır:
   *
   *   - `netAmount` → karşı tarafın nakit farkı (seller_escrow; trade payout'unda kapanır)
   *   - `shipping`  → tahsil edilen kargo (shipping_income; gelir DEĞİL, taşıyıcıya geçer)
   *   - KALAN       → platform geliri (platform_commission) — v2'de takas hizmet bedeli,
   *                   v1'de aracılık komisyonu + onun KDV'si
   *
   * Platform payı çağırandan alınmaz, tahsilattan TÜRETİLİR: tek kaynak `totalAmount`tır,
   * böylece grup tanım gereği dengelidir. (Eski hâli komisyonu ayrı parametre olarak
   * alıyor ve v1'in `commissionTaxAmount`'ını hiç yazmıyordu → her v1 takası KDV kadar
   * dengesiz bir grup bırakıyordu.)
   *
   * Nakit farkı OLMAYAN taraf da yazılır: ücret + kargo gerçekten tahsil edilmiş paradır.
   */
  async recordTradeCashCapture(
    tx: Prisma.TransactionClient,
    input: {
      tradeId?: string | null;
      tradeCashPaymentId?: string | null;
      payerId?: string | null;
      recipientId?: string | null;
      /** Bu taraftan tahsil edilen brüt. */
      totalAmount: number;
      /** Karşı tarafa gidecek nakit fark (yoksa 0). */
      netAmount: number;
      /** Bu tarafın kargo bedeli (v1 satırlarında 0). */
      shipping?: number;
      currency?: string;
    },
  ): Promise<string | null> {
    const total = round2(Number(input.totalAmount) || 0);
    const escrow = round2(Math.max(0, Number(input.netAmount) || 0));
    const shipping = round2(Math.max(0, Number(input.shipping) || 0));
    if (!(total > 0)) return null;
    const platform = round2(total - escrow - shipping);
    // Kalemler tahsilatı aşıyorsa veri bozuktur; dengesiz grup basmak yerine hiç yazma.
    if (platform < -0.005) return null;

    const entries: LedgerEntryInput[] = [
      {
        account: LedgerAccount.buyer_payment,
        direction: LedgerDirection.credit,
        amount: total,
        buyerId: input.payerId,
      },
    ];
    if (escrow > 0) {
      entries.push({
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.debit,
        amount: escrow,
        sellerId: input.recipientId,
      });
    }
    if (shipping > 0) {
      entries.push({
        account: LedgerAccount.shipping_income,
        direction: LedgerDirection.debit,
        amount: shipping,
      });
    }
    if (platform > 0) {
      entries.push({
        account: LedgerAccount.platform_commission,
        direction: LedgerDirection.debit,
        amount: platform,
      });
    }
    return this.record(tx, {
      eventType: LedgerEventType.payment_captured,
      currency: input.currency,
      idempotencyKey: input.tradeCashPaymentId
        ? `capture:trade-cash:${input.tradeCashPaymentId}`
        : null,
      entries,
      refs: {
        tradeId: input.tradeId,
        sellerId: input.recipientId,
        buyerId: input.payerId,
      },
    });
  }

  /**
   * Takas ödemesinin iadesi: dış çıkış (refund) = capture'ın ters kaydı.
   *
   * Kargoya verildikten SONRAKİ iptalde kargo bedeli iade edilmez (bkz.
   * `trade-refund-policy.ts`); o durumda `shippingReversal` 0 gelir ve
   * `shipping_income` açık kalır — para gerçekten taşıyıcıya gitmiştir.
   * Platform payı yine tahsilattan TÜREtilir: iade tutarı eksi escrow eksi kargo.
   */
  async recordTradeCashRefund(
    tx: Prisma.TransactionClient,
    input: {
      tradeId?: string | null;
      tradeCashPaymentId?: string | null;
      /** İade denemesi — idempotency anahtarının kaynağı. */
      refundAttemptId?: string | null;
      payerId?: string | null;
      recipientId?: string | null;
      /** Gerçekten iade edilen tutar. */
      refundAmount: number;
      /** Geri alınan nakit fark (escrow). */
      escrowReversal: number;
      /** Geri alınan kargo bedeli — kargoya verildikten sonra 0. */
      shippingReversal: number;
      currency?: string;
    },
  ): Promise<string | null> {
    const refund = round2(Number(input.refundAmount) || 0);
    const escrow = round2(Math.max(0, Number(input.escrowReversal) || 0));
    const shipping = round2(Math.max(0, Number(input.shippingReversal) || 0));
    if (!(refund > 0)) return null;
    const platform = round2(refund - escrow - shipping);
    if (platform < -0.005) return null;

    const entries: LedgerEntryInput[] = [
      {
        account: LedgerAccount.refund,
        direction: LedgerDirection.debit,
        amount: refund,
        buyerId: input.payerId,
      },
    ];
    if (escrow > 0) {
      entries.push({
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.credit,
        amount: escrow,
        sellerId: input.recipientId,
      });
    }
    if (shipping > 0) {
      entries.push({
        account: LedgerAccount.shipping_income,
        direction: LedgerDirection.credit,
        amount: shipping,
      });
    }
    if (platform > 0) {
      entries.push({
        account: LedgerAccount.platform_commission,
        direction: LedgerDirection.credit,
        amount: platform,
      });
    }
    return this.record(tx, {
      eventType: LedgerEventType.refund_issued,
      currency: input.currency,
      idempotencyKey: input.refundAttemptId
        ? `refund:trade-cash:${input.refundAttemptId}`
        : null,
      entries,
      refs: {
        tradeId: input.tradeId,
        sellerId: input.recipientId,
        buyerId: input.payerId,
      },
    });
  }

  /**
   * İade (tam/kısmi): dış çıkış (refund) = capture'daki escrow + komisyon + stopajın
   * ORANSAL ters kaydı. ratio = refundAmount / orderTotal. Komisyon/stopaj oranları
   * yuvarlanır; seller_escrow kalanı EMER (grup tam olarak dengelensin, epsilon aşımı yok).
   * @returns entryGroupId, veya kayıt anlamsızsa (tutar<=0 / dejenere split) null.
   */
  async recordRefund(
    tx: Prisma.TransactionClient,
    input: {
      orderId?: string | null;
      paymentId?: string | null;
      buyerId?: string | null;
      sellerId?: string | null;
      /** İade denemesi kimliği — idempotency anahtarının kaynağı (deneme başına TEK ters kayıt). */
      refundAttemptId?: string | null;
      orderTotal: number;
      commission: number;
      withholdingTax: number;
      refundAmount: number;
      currency?: string;
    },
  ): Promise<string | null> {
    const total = Number(input.orderTotal);
    const refund = Number(input.refundAmount);
    if (!(total > 0) || !(refund > 0)) return null;
    const ratio = Math.min(refund / total, 1);

    const commissionPortion = round2(input.commission * ratio);
    const withholdingPortion = round2(input.withholdingTax * ratio);
    // seller_escrow kalanı emer → krediler toplamı TAM olarak refund'a eşit (yuvarlama drift'i yok).
    const sellerPortion = round2(
      refund - commissionPortion - withholdingPortion,
    );
    if (sellerPortion <= 0) return null; // dejenere (neredeyse tümü komisyon/stopaj) → atla

    const entries: LedgerEntryInput[] = [
      {
        account: LedgerAccount.refund,
        direction: LedgerDirection.debit,
        amount: refund,
      },
      {
        account: LedgerAccount.seller_escrow,
        direction: LedgerDirection.credit,
        amount: sellerPortion,
      },
    ];
    if (commissionPortion > 0) {
      entries.push({
        account: LedgerAccount.platform_commission,
        direction: LedgerDirection.credit,
        amount: commissionPortion,
      });
    }
    if (withholdingPortion > 0) {
      entries.push({
        account: LedgerAccount.withholding_tax,
        direction: LedgerDirection.credit,
        amount: withholdingPortion,
      });
    }
    return this.record(tx, {
      eventType: LedgerEventType.refund_issued,
      currency: input.currency,
      idempotencyKey: input.refundAttemptId
        ? `refund:attempt:${input.refundAttemptId}`
        : null,
      entries,
      refs: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        buyerId: input.buyerId,
        sellerId: input.sellerId,
      },
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
