import { Injectable } from "@nestjs/common";
import { LedgerAccount, LedgerDirection } from "@prisma/client";
import { PrismaService } from "../../prisma";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** LedgerService.record'un yazdığı satırın türetim için gereken alt kümesi. */
export interface LedgerRow {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: unknown; // Prisma.Decimal | number
  orderId?: string | null;
  sellerId?: string | null;
}

/** Bir siparişin ledger'dan TÜRETİLMİŞ bakiyesi (Payment/Hold değil, defter kaynak). */
export interface OrderLedgerBalance {
  captured: number; // Σ buyer_payment credit (yakalanan brüt)
  refunded: number; // Σ refund debit (iade edilen brüt)
  remainingRefundable: number; // captured − refunded (yapısal kısmi-iade tavanı)
  escrowNet: number; // signed seller_escrow (capture debit − payout/refund credit)
}

const ZERO_BALANCE: OrderLedgerBalance = {
  captured: 0,
  refunded: 0,
  remainingRefundable: 0,
  escrowNet: 0,
};

/**
 * LedgerBalanceService (Faz 6.3) — defterin OKUMA modeli (CQRS read side). Bakiyeleri
 * Payment/Hold satırlarından DEĞİL, değişmez `ledger_entries`'ten TÜRETİR. Tek türetim
 * otoritesi: `deriveOrderBalances` saf fonksiyonu hem canlı DB sorgusu hem de
 * reconciliation'ın elindeki pencere satırları üzerinde AYNI mantığı çalıştırır (DRY).
 *
 * NOT (6.3 kapsam kararı): defter burada OKUMA/çapraz-doğrulama kaynağıdır. Para YAZMA
 * yolunu (refund tavanı / payout uygunluğu) defterden zorlamak (Payment/Hold'u kaynak
 * olmaktan tamamen çıkarmak) bilinçli olarak ERTELENDİ: defter @Optional ve POST-COMMIT
 * yollarda (capture, payout tamamlama) best-effort — eksik/gecikmeli olabilir; onunla
 * para akışını BLOKLAMAK "defter hatası parayı bozmaz" invaryantını çiğnerdi. Bunun
 * yerine reconciliation defter-native fazla-iade ve escrow kalıntısı alarmı basar.
 *
 * TX-İÇİ yazımlar (iade, payout kesintisi) ise FAIL-LOUD: aynı transaction'da
 * olduklarından hata tüm işlemi geri alır → "para hareketi var, defter kaydı yok"
 * durumu oluşamaz. Bakiyeleri buradan TÜRETİP kaynak yapmak (Faz 6.3'ün geri kalanı)
 * ancak tüm para yolları bu garantiye taşınınca anlamlıdır.
 */
@Injectable()
export class LedgerBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Saf türetim: bir satır kümesinden orderId bazında bakiye çıkarır. Reconciliation
   * pencere satırlarını, `orderBalance` ise tek-sipariş sorgusunu buraya besler → tek yer.
   */
  static deriveOrderBalances(
    rows: LedgerRow[],
  ): Map<string, OrderLedgerBalance> {
    const map = new Map<string, OrderLedgerBalance>();
    for (const r of rows) {
      if (!r.orderId) continue;
      const b = map.get(r.orderId) ?? { ...ZERO_BALANCE };
      const amt = Number(r.amount);
      if (
        r.account === LedgerAccount.buyer_payment &&
        r.direction === LedgerDirection.credit
      ) {
        b.captured += amt;
      } else if (
        r.account === LedgerAccount.refund &&
        r.direction === LedgerDirection.debit
      ) {
        b.refunded += amt;
      }
      if (r.account === LedgerAccount.seller_escrow) {
        b.escrowNet += r.direction === LedgerDirection.debit ? amt : -amt;
      }
      map.set(r.orderId, b);
    }
    for (const b of map.values()) {
      b.captured = round2(b.captured);
      b.refunded = round2(b.refunded);
      b.escrowNet = round2(b.escrowNet);
      b.remainingRefundable = round2(b.captured - b.refunded);
    }
    return map;
  }

  /** Tek siparişin defterden türetilmiş bakiyesi (kayıt yoksa sıfır). */
  async orderBalance(orderId: string): Promise<OrderLedgerBalance> {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { orderId },
      select: {
        account: true,
        direction: true,
        amount: true,
        orderId: true,
        sellerId: true,
      },
    });
    return (
      LedgerBalanceService.deriveOrderBalances(rows).get(orderId) ?? {
        ...ZERO_BALANCE,
      }
    );
  }

  /** Siparişin defterden türetilmiş kalan iade edilebilir tutarı (captured − refunded). */
  async orderRemainingRefundable(orderId: string): Promise<number> {
    return (await this.orderBalance(orderId)).remainingRefundable;
  }

  /**
   * Bir satıcının escrow'da tutulan net bakiyesi: capture debit − payout/refund credit.
   * Tam settle olmuş (payout tamam VEYA iade edilmiş) siparişlerde ≈ 0; askıdakiler pozitif.
   */
  async sellerEscrowBalance(sellerId: string): Promise<number> {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { account: LedgerAccount.seller_escrow, sellerId },
      _sum: { amount: true },
    });
    let bal = 0;
    for (const r of rows) {
      const sum = Number(r._sum.amount ?? 0);
      bal += r.direction === LedgerDirection.debit ? sum : -sum;
    }
    return round2(bal);
  }
}
