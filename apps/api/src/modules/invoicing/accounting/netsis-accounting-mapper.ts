import { Prisma, type NetsisSyncKind } from "@prisma/client";
import { trCalendarDate } from "../../../common/helpers/tr-calendar";
import { translateMessage } from "../../i18n/translate";
import type { NetsisBankTransfer, NetsisMixedReceipt } from "../../netsis";
import { isNetsisCorporateTaxId } from "../provider/netsis-cari";
import { NETSIS_CARI_CODE_MAX_LENGTH } from "../provider/netsis-invoice-settings";
import { NETSIS_TEXT_MAX_LENGTH } from "../provider/netsis-invoice.constants";
import type { NetsisAccountingSettings } from "./netsis-accounting-settings";

/**
 * Para hareketi → Netsis muhasebe kaydı. SAF: ağ yok, DI yok, veritabanı yok —
 * kaynak `NetsisAccountingSourceService`'ten, faturanın carisi Netsis fişinden
 * hazır gelir. Dört hareketin dört kaydı:
 *
 *  - fatura tahsilatı   → MixedReceiptsMain, faturanın carisinde, fatura
 *                         numarasıyla (cariyi kapatır), PayTR ara hesabına;
 *  - PayTR hakedişi     → BankRemittanceTransfer, ara hesap → şirket bankası,
 *                         net tutar; PSP kesintisi gövdede ve açıklamada;
 *  - satıcı ödemesi     → BankRemittanceTransfer, şirket bankası → satıcı
 *                         carisi (kurumsal: kendi carisi; bireysel: ortak
 *                         perakende cari + açıklamada ad, IBAN son 4, referans);
 *  - alıcı iadesi       → MixedReceiptsMain NEGATİF tutarla (tahsilat ters
 *                         kaydı), alıcının carisinde.
 *
 * Tutarlar Decimal ile hesaplanır ve Netsis sınırında ondalık METNE çevrilir.
 * Alan adlarının hepsi tahmindir: modeller `netsis.types.ts`'te, bu dosyaya
 * özgü ek alanlar aşağıda `NETSIS_ACCOUNTING_FIELDS`'ta — hepsi VERIFY.
 */

// VERIFY against GET definitions/MixedReceiptsMain ve BankRemittanceTransfer.
export const NETSIS_ACCOUNTING_FIELDS = {
  /** VERIFY: tahsilatın girdiği banka hesabı (PayTR ara hesabı). */
  receiptBankAccount: "BANKA_HESAP_KODU",
  /**
   * VERIFY: tahsilatın KAPATTIĞI fatura. Netsis'te fatura-tahsilat eşleşmesi
   * (cari kapama) bu alanla mı, ayrı bir kapama kaydıyla mı yapılıyor —
   * muhasebeciye sorulacak.
   */
  closesInvoiceNumber: "FATIRS_NO",
  /** VERIFY: havalenin/virmanın ÇIKTIĞI hesap. */
  transferFromAccount: "KAYNAK_HESAP_KODU",
  /** VERIFY: hesaplar arası virmanda HEDEF hesap (hakediş → şirket bankası). */
  transferToAccount: "HEDEF_HESAP_KODU",
  /**
   * VERIFY: PSP kesintisi. Gateway'de masraf/gider kaydı tipi yok; tutar ve
   * gider hesabı virman gövdesine bu alanlarla yazılır, Netsis tanımazsa
   * açıklamadaki "kesinti" metni kalır (docs/NETSIS.md → açık kalemler).
   */
  feeAmount: "MASRAF_TUTARI",
  feeAccount: "MASRAF_HESAP_KODU",
  /**
   * VERIFY: bizim izleme anahtarımız (`<kind>:<sourceId>`). Netsis'te çift
   * kayıt şüphesinde (yanıt kayboldu) kaydı bulmanın tek yolu budur.
   */
  trackingReference: "EKACK1",
} as const;

/** VERIFY: `ACIKLAMA` uzunluğu — fatura fişiyle aynı varsayıldı. */
const DESCRIPTION_MAX_LENGTH = NETSIS_TEXT_MAX_LENGTH.slipDescription;

const ZERO = new Prisma.Decimal(0);

/** Ödemeyi alan / iadeyi alan taraf. */
export interface NetsisAccountingParty {
  /** Görünen ad (kişi adı ya da şirket unvanı). */
  name: string;
  taxId: string | null;
  /** B/K kodu — kurumsal tarafın Netsis cari kodu. */
  adminCode: string;
}

export interface InvoiceCollectionSource {
  kind: "invoice_collection";
  invoiceNumber: string;
  issuedAt: Date;
  /** Faturanın KDV dahil toplamı. */
  gross: Prisma.Decimal;
  /** Faturanın Netsis'te yazıldığı cari (fişin `CARI_KODU`'su). */
  cariCode: string;
}

export interface SettlementTransferSource {
  kind: "settlement_transfer";
  /** Hakedişi veren PayTR mağazası (pazaryeri / üyelik). */
  merchant: string;
  datePaid: Date;
  salesTotal: Prisma.Decimal;
  returnTotal: Prisma.Decimal;
  netTotal: Prisma.Decimal;
}

export interface PayoutTransferSource {
  kind: "payout_transfer";
  /** PayTR talimat referansı; yoksa bizim `transId`. */
  reference: string;
  /** Gerçekten gönderilen tutar. */
  amount: Prisma.Decimal;
  completedAt: Date;
  seller: NetsisAccountingParty;
  ibanLast4: string | null;
}

export interface RefundReversalSource {
  kind: "refund_reversal";
  /** Sipariş (ORD-…) ya da takas numarası. */
  reference: string;
  /** PSP'nin iade ettiği tutar (pozitif). */
  amount: Prisma.Decimal;
  succeededAt: Date;
  buyer: NetsisAccountingParty;
}

export type NetsisAccountingSource =
  | InvoiceCollectionSource
  | SettlementTransferSource
  | PayoutTransferSource
  | RefundReversalSource;

export interface NetsisAccountingMappingSettings {
  accounts: NetsisAccountingSettings["accounts"];
  /** Fatura ayarlarındaki ortak perakende cari (`netsis.cari.retailCode`). */
  retailCariCode: string;
}

export type NetsisAccountingPosting =
  | {
      operation: "collection";
      body: NetsisMixedReceipt;
      /** Gönderilen İŞARETLİ tutar (iade ters kaydında negatif). */
      amount: Prisma.Decimal;
    }
  | {
      operation: "bankTransfer";
      body: NetsisBankTransfer;
      amount: Prisma.Decimal;
    };

/**
 * Bizim verdiğimiz "yazma" kararı (eksik ayar, geçersiz cari kodu). Senkron
 * bunu `configuration` sayar: yeniden denemek sonucu değiştirmez, bütçe hemen
 * biter ve alarm görünür.
 */
export class NetsisAccountingMappingError extends Error {
  constructor(
    readonly i18nKey: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(translateMessage(i18nKey, "tr", params));
    this.name = "NetsisAccountingMappingError";
  }
}

/** Netsis sınırı: Decimal → ondalık metin (2 hane, yarım yukarı). */
function money(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function clip(text: string, max = DESCRIPTION_MAX_LENGTH): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Netsis TÜRKÇE bir ERP'dir: kayıt açıklamaları her zaman tr katalogdan. */
function describe(
  key: string,
  values: Record<string, string | number>,
): string {
  return clip(
    translateMessage(`server.netsis.accounting.description.${key}`, "tr", values),
  );
}

function requireAccount(
  settings: NetsisAccountingMappingSettings,
  account: keyof NetsisAccountingSettings["accounts"],
): string {
  const code = settings.accounts[account];
  if (!code) {
    throw new NetsisAccountingMappingError(
      "server.netsis.accounting.error.accountMissing",
      { account },
    );
  }
  return code;
}

/**
 * Tarafın carisi — kural `provider/netsis-cari.ts`'ten (faturayla aynı):
 * VKN'li taraf kendi carisi (B/K kodu), diğerleri ortak perakende cari.
 */
export function netsisPartyCari(
  party: NetsisAccountingParty,
  retailCariCode: string,
): { code: string; pooled: boolean } {
  if (isNetsisCorporateTaxId(party.taxId)) {
    const code = party.adminCode.trim();
    if (!code || code.length > NETSIS_CARI_CODE_MAX_LENGTH) {
      throw new NetsisAccountingMappingError(
        "server.netsis.accounting.error.corporateCariCodeInvalid",
        { code: code || "-" },
      );
    }
    return { code, pooled: false };
  }
  if (!retailCariCode) {
    throw new NetsisAccountingMappingError(
      "server.netsis.accounting.error.retailCariMissing",
    );
  }
  return { code: retailCariCode, pooled: true };
}

/** Hakedişte PayTR'nin düştüğü kesinti: satış − iade − net (negatifse 0). VERIFY. */
export function paytrSettlementFee(
  source: Pick<SettlementTransferSource, "salesTotal" | "returnTotal" | "netTotal">,
): Prisma.Decimal {
  const fee = source.salesTotal.minus(source.returnTotal).minus(source.netTotal);
  return fee.isNegative() ? ZERO : fee;
}

/**
 * Kaynak + ayarlar → Netsis'e gidecek kayıt. `trackingKey` kaydın
 * idempotency anahtarıdır (`<kind>:<sourceId>`) ve gövdeye izleme referansı
 * olarak yazılır.
 */
export function buildNetsisAccountingPosting(
  source: NetsisAccountingSource,
  settings: NetsisAccountingMappingSettings,
  trackingKey: string,
): NetsisAccountingPosting {
  const F = NETSIS_ACCOUNTING_FIELDS;
  switch (source.kind) {
    case "invoice_collection": {
      const amount = source.gross;
      return {
        operation: "collection",
        amount,
        body: {
          CARI_KOD: source.cariCode,
          TARIH: trCalendarDate(source.issuedAt),
          TUTAR: money(amount),
          ACIKLAMA: describe("invoiceCollection", {
            invoiceNumber: source.invoiceNumber,
          }),
          BELGE_NO: source.invoiceNumber,
          [F.closesInvoiceNumber]: source.invoiceNumber,
          [F.receiptBankAccount]: requireAccount(settings, "paytrClearing"),
          [F.trackingReference]: trackingKey,
        },
      };
    }
    case "settlement_transfer": {
      const amount = source.netTotal;
      const fee = paytrSettlementFee(source);
      const date = trCalendarDate(source.datePaid);
      const feeAccount = settings.accounts.pspFeeExpense;
      return {
        operation: "bankTransfer",
        amount,
        body: {
          TARIH: date,
          TUTAR: money(amount),
          ACIKLAMA: describe("settlementTransfer", {
            date,
            fee: money(fee),
          }),
          BELGE_NO: `PAYTR-${date}`,
          [F.transferFromAccount]: requireAccount(settings, "paytrClearing"),
          [F.transferToAccount]: requireAccount(settings, "mainBank"),
          [F.feeAmount]: money(fee),
          ...(feeAccount ? { [F.feeAccount]: feeAccount } : {}),
          [F.trackingReference]: trackingKey,
        },
      };
    }
    case "payout_transfer": {
      const cari = netsisPartyCari(source.seller, settings.retailCariCode);
      const amount = source.amount;
      return {
        operation: "bankTransfer",
        amount,
        body: {
          CARI_KOD: cari.code,
          TARIH: trCalendarDate(source.completedAt),
          TUTAR: money(amount),
          // Ortak caride kişiyi ayırt eden tek şey açıklamadır.
          ACIKLAMA: cari.pooled
            ? describe("payoutTransferPooled", {
                name: source.seller.name,
                last4: source.ibanLast4 ?? "----",
                reference: source.reference,
              })
            : describe("payoutTransfer", { reference: source.reference }),
          BELGE_NO: source.reference,
          [F.transferFromAccount]: requireAccount(settings, "mainBank"),
          [F.trackingReference]: trackingKey,
        },
      };
    }
    case "refund_reversal": {
      const cari = netsisPartyCari(source.buyer, settings.retailCariCode);
      // VERIFY: Netsis'te tahsilatın ters kaydı negatif tutarlı tahsilat mı,
      // yoksa ayrı bir tediye/iade kaydı mı?
      const amount = source.amount.negated();
      return {
        operation: "collection",
        amount,
        body: {
          CARI_KOD: cari.code,
          TARIH: trCalendarDate(source.succeededAt),
          TUTAR: money(amount),
          ACIKLAMA: cari.pooled
            ? describe("refundReversalPooled", {
                reference: source.reference,
                name: source.buyer.name,
              })
            : describe("refundReversal", { reference: source.reference }),
          BELGE_NO: source.reference,
          [F.receiptBankAccount]: requireAccount(settings, "paytrClearing"),
          [F.trackingReference]: trackingKey,
        },
      };
    }
  }
}

/** Kaynağın mantıksal tablo adı (`NetsisSyncRecord.sourceType`). */
export const NETSIS_SYNC_SOURCE_TYPE: Record<NetsisSyncKind, string> = {
  invoice_collection: "fiscal_invoice",
  settlement_transfer: "paytr_settlement",
  payout_transfer: "payout_transfer",
  refund_reversal: "refund_attempt",
};

/** `<kind>:<sourceId>` — kaydın idempotency anahtarı. */
export function netsisSyncIdempotencyKey(
  kind: NetsisSyncKind,
  sourceId: string,
): string {
  return `${kind}:${sourceId}`;
}
