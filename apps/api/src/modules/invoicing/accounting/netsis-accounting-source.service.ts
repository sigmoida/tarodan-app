import { Injectable } from "@nestjs/common";
import {
  PayoutStatus,
  RefundAttemptStatus,
  type NetsisSyncKind,
  type Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { translateMessage } from "../../i18n/translate";
import type {
  InvoiceCollectionSource,
  NetsisAccountingParty,
  NetsisAccountingSource,
} from "./netsis-accounting-mapper";

/**
 * Fatura tahsilatı kaynağı, carisi HENÜZ çözülmemiş hâliyle: cari Netsis
 * fişinden okunur (ağ çağrısı) ve bunu yalnız gönderen servis yapar.
 */
export type LoadedInvoiceCollectionSource = Omit<
  InvoiceCollectionSource,
  "cariCode"
> & {
  /** `<FaturaTip>:<FATIRS_NO>` — fişi bulmanın anahtarı. */
  providerRef: string;
};

export type LoadedNetsisAccountingSource =
  | Exclude<NetsisAccountingSource, InvoiceCollectionSource>
  | LoadedInvoiceCollectionSource;

/**
 * - `ready`: aynalanacak kesinleşmiş para hareketi.
 * - `not_applicable`: kaynak kesin ama aynalanacak bir şey yok (sıfır tutar,
 *   test şeridi, taraf yok) — `skipped` satır açılır ki süpürme tekrar bakmasın.
 * - `absent`: kaynak yok, bize ait değil (eLogo faturası, iade faturası) ya da
 *   HENÜZ kesinleşmedi — satır AÇILMAZ; kesinleşince olay ya da süpürme getirir.
 */
export type NetsisAccountingSourceLoad =
  | { state: "ready"; source: LoadedNetsisAccountingSource }
  | { state: "not_applicable"; reason: string }
  | { state: "absent"; reason: string };

const reason = (key: string, values?: Record<string, string>): string =>
  translateMessage(`server.netsis.accounting.skip.${key}`, "tr", values);

const notApplicable = (key: string): NetsisAccountingSourceLoad => ({
  state: "not_applicable",
  reason: reason(key),
});

const absent = (
  key: string,
  values?: Record<string, string>,
): NetsisAccountingSourceLoad => ({ state: "absent", reason: reason(key, values) });

const isPositive = (value: Prisma.Decimal): boolean => value.greaterThan(0);

const PARTY_SELECT = {
  displayName: true,
  companyName: true,
  taxId: true,
  adminCode: true,
} as const;

/**
 * Muhasebe senkronunun KAYNAK okuyucusu: dört para hareketini, kesinleşip
 * kesinleşmediğine (uygunluk) karar vererek mapper'ın beklediği şekle getirir.
 * Uygunluk kuralları YALNIZ buradadır — olay işleyicisi, cron süpürmesi ve
 * gönderen servis aynı kararı buradan alır.
 *
 * Kaynaklar başka modüllerin tablolarıdır (payout, ödeme, PayTR mutabakatı);
 * burada yalnız OKUNUR, hiçbirine yazılmaz (CLAUDE.md §1: okuma modeli).
 */
@Injectable()
export class NetsisAccountingSourceService {
  constructor(private readonly prisma: PrismaService) {}

  load(
    kind: NetsisSyncKind,
    sourceId: string,
  ): Promise<NetsisAccountingSourceLoad> {
    switch (kind) {
      case "invoice_collection":
        return this.invoice(sourceId);
      case "settlement_transfer":
        return this.settlement(sourceId);
      case "payout_transfer":
        return this.payout(sourceId);
      case "refund_reversal":
        return this.refund(sourceId);
    }
  }

  /**
   * Netsis'in kestiği, alıcıya ulaşmış (`sent`/`signed`) gelir faturası.
   * eLogo faturaları yok sayılır (Netsis'te carisi yok); iade faturası tahsil
   * edilen bir bedel değildir — parası iade ters kaydıyla aynalanır.
   */
  private async invoice(id: string): Promise<NetsisAccountingSourceLoad> {
    const row = await this.prisma.fiscalInvoice.findUnique({
      where: { id },
      select: {
        provider: true,
        type: true,
        status: true,
        invoiceNumber: true,
        providerRef: true,
        issuedAt: true,
        sentAt: true,
        createdAt: true,
        total: true,
      },
    });
    if (!row) return absent("sourceMissing");
    if (row.provider !== "netsis" || row.type === "return_invoice") {
      return absent("sourceMissing");
    }
    if (
      (row.status !== "sent" && row.status !== "signed") ||
      !row.invoiceNumber ||
      !row.providerRef
    ) {
      return absent("notFinal", { status: row.status });
    }
    if (!isPositive(row.total)) return notApplicable("zeroAmount");
    return {
      state: "ready",
      source: {
        kind: "invoice_collection",
        invoiceNumber: row.invoiceNumber,
        providerRef: row.providerRef,
        issuedAt: row.issuedAt ?? row.sentAt ?? row.createdAt,
        gross: row.total,
      },
    };
  }

  /** Gerçekleşmiş (projeksiyon olmayan) PayTR hakedişi. */
  private async settlement(id: string): Promise<NetsisAccountingSourceLoad> {
    const row = await this.prisma.paytrSettlement.findUnique({
      where: { id },
      select: {
        isProjection: true,
        paytrMerchant: true,
        datePaid: true,
        salesTotal: true,
        returnTotal: true,
        netTotal: true,
      },
    });
    if (!row) return absent("sourceMissing");
    if (row.isProjection) return absent("notFinal", { status: "projection" });
    // VERIFY: net ≤ 0 (iadeler satışı aştı) gün PayTR'den para çekilir mi?
    // Muhasebeci karar verene kadar aktarım yazılmaz.
    if (!isPositive(row.netTotal)) return notApplicable("zeroAmount");
    return {
      state: "ready",
      source: {
        kind: "settlement_transfer",
        merchant: row.paytrMerchant,
        datePaid: row.datePaid,
        salesTotal: row.salesTotal,
        returnTotal: row.returnTotal,
        netTotal: row.netTotal,
      },
    };
  }

  /** Tamamlanmış satıcı ödemesi; tutar GERÇEKTEN gönderilen (aşama-1 snapshot'ı). */
  private async payout(id: string): Promise<NetsisAccountingSourceLoad> {
    const row = await this.prisma.payoutTransfer.findUnique({
      where: { id },
      select: {
        status: true,
        netAmount: true,
        submittedAmount: true,
        processedAt: true,
        updatedAt: true,
        providerReference: true,
        transId: true,
        transferIban: true,
        transferName: true,
        seller: { select: { ...PARTY_SELECT, isTestAccount: true } },
      },
    });
    if (!row) return absent("sourceMissing");
    if (row.status !== PayoutStatus.completed) {
      return absent("notFinal", { status: row.status });
    }
    const amount = row.submittedAmount ?? row.netAmount;
    // Tamamı kesintiye giden payout (net 0) para hareketi değildir.
    if (!isPositive(amount)) return notApplicable("zeroAmount");
    if (row.seller.isTestAccount) return notApplicable("testLane");
    const iban = row.transferIban.replace(/\s/g, "");
    return {
      state: "ready",
      source: {
        kind: "payout_transfer",
        reference: row.providerReference?.trim() || row.transId,
        amount,
        completedAt: row.processedAt ?? row.updatedAt,
        seller: this.party(row.seller, row.transferName),
        ibanLast4: iban.length >= 4 ? iban.slice(-4) : null,
      },
    };
  }

  /**
   * PSP'de başarıyla sonuçlanan alıcı iadesi (sipariş ya da takas nakit
   * iadesi). Alıcı: siparişin alıcısı ya da takas satırını ödeyen taraf.
   */
  private async refund(id: string): Promise<NetsisAccountingSourceLoad> {
    const row = await this.prisma.refundAttempt.findUnique({
      where: { id },
      select: {
        status: true,
        amount: true,
        providerSucceededAt: true,
        finalizedAt: true,
        updatedAt: true,
        order: { select: { orderNumber: true, buyerId: true } },
        trade: { select: { tradeNumber: true } },
        payment: {
          select: {
            isTest: true,
            tradeCashPayment: { select: { payerId: true } },
          },
        },
      },
    });
    if (!row) return absent("sourceMissing");
    if (
      row.status !== RefundAttemptStatus.succeeded &&
      row.status !== RefundAttemptStatus.finalized
    ) {
      return absent("notFinal", { status: row.status });
    }
    if (!isPositive(row.amount)) return notApplicable("zeroAmount");
    // Test şeridi PayTR test modunda ödenir: gerçek para hiç girmedi/çıkmadı.
    if (row.payment.isTest) return notApplicable("testLane");
    const buyerId =
      row.order?.buyerId ?? row.payment.tradeCashPayment?.payerId ?? null;
    const buyer = buyerId
      ? await this.prisma.user.findUnique({
          where: { id: buyerId },
          select: PARTY_SELECT,
        })
      : null;
    if (!buyer) return notApplicable("partyMissing");
    return {
      state: "ready",
      source: {
        kind: "refund_reversal",
        reference: row.order?.orderNumber ?? row.trade?.tradeNumber ?? id,
        amount: row.amount,
        succeededAt: row.providerSucceededAt ?? row.finalizedAt ?? row.updatedAt,
        buyer: this.party(buyer),
      },
    };
  }

  /**
   * Taraf: cari kuralı vergi numarasına bakar; ad, ortak caride kişiyi ayırt
   * eden açıklamaya girer (ödemede banka hesabının sahibi önce gelir).
   */
  private party(
    user: {
      displayName: string;
      companyName: string | null;
      taxId: string | null;
      adminCode: string;
    },
    accountHolder?: string | null,
  ): NetsisAccountingParty {
    return {
      name:
        accountHolder?.trim() || user.companyName?.trim() || user.displayName,
      taxId: user.taxId,
      adminCode: user.adminCode,
    };
  }
}
