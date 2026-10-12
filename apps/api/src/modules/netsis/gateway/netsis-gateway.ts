import type { NetsisMode } from "../../../config/netsis";
import type {
  NetsisArp,
  NetsisBankTransfer,
  NetsisCallOptions,
  NetsisEDocumentRequest,
  NetsisEDocumentSendResult,
  NetsisEDocumentStatus,
  NetsisItem,
  NetsisItemSlip,
  NetsisItemSlipKey,
  NetsisMixedReceipt,
  NetsisPingResult,
  NetsisRawRecord,
  NetsisSlipTotals,
  NetsisTransactionContext,
} from "../helpers/netsis.types";

/**
 * Netsis'in uygulamaya açılan TEK yüzeyi. `NetsisLiveGateway` (gerçek
 * NetOpenX REST) ve `NetsisStubGateway` (bellek içi) ikisi de bunu uygular;
 * `netsis-gateway.contract.spec.ts` ikisinin aynı yüzeyi taşıdığını kilitler.
 * Yeni bir yetenek önce buraya eklenir, sonra ikisine — biri eksik kalırsa
 * derleme ve sözleşme testi kırılır.
 *
 * Tüm yazma yöntemleri isteğe bağlı `NetsisCallOptions` alır: bir
 * `withTransaction` bağlamı geçirilirse çağrı o transaction'a bağlanır.
 */

/** Cari (ARPs). */
export interface NetsisArpsApi {
  /** `CARI_KOD` ile; kayıt yoksa `null`. */
  findByCode(code: string, options?: NetsisCallOptions): Promise<NetsisArp | null>;
  create(arp: NetsisArp, options?: NetsisCallOptions): Promise<NetsisArp>;
  update(
    code: string,
    arp: NetsisArp,
    options?: NetsisCallOptions,
  ): Promise<NetsisArp>;
  /**
   * Carinin e-fatura mükellefiyet bayraklarını GİB listesinden yeniler
   * (EDocument/EDocCurrentUpdate). Kod verilmezse tüm cariler (VERIFY).
   */
  refreshEInvoiceFlags(
    code?: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisRawRecord>;
}

/** Stok/hizmet kartları (Items). */
export interface NetsisItemsApi {
  findByCode(
    code: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisItem | null>;
  create(item: NetsisItem, options?: NetsisCallOptions): Promise<NetsisItem>;
  /** Varsa olanı, yoksa oluşturduğunu döndürür (yarışta çakışmayı yutar). */
  ensureServiceItem(
    item: NetsisItem,
    options?: NetsisCallOptions,
  ): Promise<NetsisItem>;
}

/** Faturalar (ItemSlips). */
export interface NetsisItemSlipsApi {
  create(
    slip: NetsisItemSlip,
    options?: NetsisCallOptions,
  ): Promise<NetsisItemSlip>;
  /** Faturanın tamamı (başlık + satırlar); yoksa `null`. */
  details(
    key: NetsisItemSlipKey,
    options?: NetsisCallOptions,
  ): Promise<NetsisItemSlip | null>;
  /** Kaydetmeden toplamları hesaplatır (HesaplamalariYap). */
  calculate(
    slip: NetsisItemSlip,
    options?: NetsisCallOptions,
  ): Promise<NetsisSlipTotals>;
  html(key: NetsisItemSlipKey, options?: NetsisCallOptions): Promise<string>;
  newEInvoiceNumber(
    serial: string,
    options?: NetsisCallOptions,
  ): Promise<string>;
  newEArchiveNumber(
    serial: string,
    options?: NetsisCallOptions,
  ): Promise<string>;
  delete(key: NetsisItemSlipKey, options?: NetsisCallOptions): Promise<void>;
}

/** e-Belge (EDocument). */
export interface NetsisEDocumentApi {
  /** Faturayı GİB'e / entegratöre gönderir. */
  send(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<NetsisEDocumentSendResult>;
  /** Gelen/giden kutusundan durumu tazeler. */
  check(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<NetsisEDocumentStatus>;
  cancelEArchive(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<void>;
  show(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<string>;
}

/** Tahsilat (MixedReceiptsMain) ve havale/EFT (BankRemittanceTransfer). */
export interface NetsisReceiptsApi {
  createCollection(
    receipt: NetsisMixedReceipt,
    options?: NetsisCallOptions,
  ): Promise<NetsisMixedReceipt>;
  getCollection(
    id: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisMixedReceipt | null>;
  createBankTransfer(
    transfer: NetsisBankTransfer,
    options?: NetsisCallOptions,
  ): Promise<NetsisBankTransfer>;
}

/** NetOpenX transaction'ları. */
export interface NetsisTransactionsApi {
  open(): Promise<string>;
  commit(transactionId: string): Promise<void>;
  rollback(transactionId: string): Promise<void>;
  /** Başarıda commit, hatada rollback; `fn`'in hatası yükselir. */
  withTransaction<T>(
    fn: (tx: NetsisTransactionContext) => Promise<T>,
  ): Promise<T>;
}

/** Kimliksiz `public/*` uçları. */
export interface NetsisPublicApi {
  ping(): Promise<void>;
  version(): Promise<string>;
  companyList(): Promise<NetsisRawRecord[]>;
  authorizedBranches(
    company: string,
    username: string,
  ): Promise<NetsisRawRecord[]>;
}

/** NetRS sorguları — YALNIZ okuma. */
export interface NetsisQueriesApi {
  /** Tek bir SELECT; başka her şey Netsis'e gitmeden reddedilir. */
  select(sql: string): Promise<NetsisRawRecord[]>;
}

export interface NetsisGateway {
  readonly mode: NetsisMode;
  readonly arps: NetsisArpsApi;
  readonly items: NetsisItemsApi;
  readonly itemSlips: NetsisItemSlipsApi;
  readonly eDocuments: NetsisEDocumentApi;
  readonly receipts: NetsisReceiptsApi;
  readonly transactions: NetsisTransactionsApi;
  readonly publicApi: NetsisPublicApi;
  readonly queries: NetsisQueriesApi;
  /** Erişim + sürüm + kimlikli ping. */
  ping(): Promise<NetsisPingResult>;
}
