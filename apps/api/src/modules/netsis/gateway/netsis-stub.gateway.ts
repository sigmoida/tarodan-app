import { Injectable } from "@nestjs/common";
import { isValidNetsisSerial } from "@tarodan/types";
import {
  assertNetsisReadOnlySelect,
  bindNetsisQueryParams,
} from "../clients/netsis-queries.client";
import { NETSIS_SLIP_TRACKING_KEY_FIELD } from "../helpers/netsis.constants";
import { ensureNetsisItem } from "../helpers/netsis-ensure-item.helper";
import {
  netsisArpCode,
  netsisItemCode,
  sumNetsisSlipLines,
} from "../helpers/netsis-model.helper";
import { runInNetsisTransaction } from "../helpers/netsis-transaction.helper";
import type {
  NetsisArp,
  NetsisBankTransfer,
  NetsisCallOptions,
  NetsisEDocumentRequest,
  NetsisEDocumentSendResult,
  NetsisEDocumentState,
  NetsisEDocumentStatus,
  NetsisItem,
  NetsisItemSlip,
  NetsisItemSlipKey,
  NetsisMixedReceipt,
  NetsisPingResult,
  NetsisQueryParams,
  NetsisRawRecord,
  NetsisSlipTotals,
  NetsisTransactionContext,
} from "../helpers/netsis.types";
import { NetsisRequestException } from "../http/netsis-error";
import type {
  NetsisArpsApi,
  NetsisEDocumentApi,
  NetsisGateway,
  NetsisItemSlipsApi,
  NetsisItemsApi,
  NetsisPublicApi,
  NetsisQueriesApi,
  NetsisReceiptsApi,
  NetsisTransactionsApi,
} from "./netsis-gateway";

/**
 * Bellek içi Netsis — `NETSIS_MODE=stub` (yerel, staging UAT, testler).
 *
 * Ağa çıkmaz ama gerçek sunucunun KURALLARINI taklit eder, yoksa stub'la
 * geçen bir akış canlıda ilk faturada patlardı:
 *  - fatura, var olan cariye ve var olan stok kartlarına yazılır,
 *  - aynı tip + numara ikinci kez yazılamaz (çakışma),
 *  - numaralar seri + yıl + 9 hanelik sıra (`TRD2026000000001`) ve
 *    deterministiktir; ETTN'ler de sıra numarasından türeyen UUID'lerdir,
 *  - toplamlar satırlardan Decimal ile hesaplanır,
 *  - gönderilmiş belge silinemez; yalnız gönderilmiş belge iptal edilebilir.
 *
 * Bilerek basit: transaction commit/rollback yalnız durum kaydeder, rollback
 * yazılanları geri almaz — yalnız izleme anahtarı araması
 * (`findByTrackingKey`) canlıdaki gibi commit edilmemiş fişi görmez.
 * Faturalama sağlayıcısının spec/e2e'leri için `snapshot()`,
 * `setEDocumentState()`, `loseNextCommitResponse()` ve `reset()` açıktır.
 */

export type NetsisStubTransactionState = "open" | "committed" | "rolledBack";

export interface NetsisStubEDocument {
  ettn: string;
  state: NetsisEDocumentState;
  slip: Pick<NetsisItemSlipKey, "FaturaTip" | "FATIRS_NO">;
}

export interface NetsisStubSnapshot {
  arps: NetsisArp[];
  items: NetsisItem[];
  slips: NetsisItemSlip[];
  eDocuments: NetsisStubEDocument[];
  collections: NetsisMixedReceipt[];
  bankTransfers: NetsisBankTransfer[];
  transactions: { id: string; state: NetsisStubTransactionState }[];
}

/** Numara verilmemiş faturaya stub'ın verdiği seri. */
const STUB_DEFAULT_SERIAL = "TRD";

const clone = <T>(value: T): T => structuredClone(value);

const conflict = (detail: string) =>
  new NetsisRequestException("conflict", 409, `stub: ${detail} already exists`);
const notFound = (detail: string) =>
  new NetsisRequestException(
    "validation",
    404,
    `stub: ${detail} not found`,
    "server.netsis.recordNotFound",
  );
const invalid = (detail: string) =>
  new NetsisRequestException("validation", 400, `stub: ${detail}`);

const slipId = (key: Pick<NetsisItemSlipKey, "FaturaTip" | "FATIRS_NO">) =>
  `${key.FaturaTip}|${key.FATIRS_NO}`;

class NetsisStubStore {
  readonly arps = new Map<string, NetsisArp>();
  readonly items = new Map<string, NetsisItem>();
  readonly slips = new Map<string, NetsisItemSlip>();
  /** Fatura anahtarına göre (`slipId`). */
  readonly eDocuments = new Map<string, NetsisStubEDocument>();
  readonly collections = new Map<string, NetsisMixedReceipt>();
  readonly bankTransfers: NetsisBankTransfer[] = [];
  readonly transactions = new Map<string, NetsisStubTransactionState>();
  /** Fiş (`slipId`) → içinde yazıldığı transaction; transaction dışı yazımda yok. */
  readonly slipTransactions = new Map<string, string>();
  readonly numberCounters = new Map<string, number>();
  /** Test kancası: bir sonraki commit uygulanır ama yanıtı "kaybolur". */
  loseNextCommitResponse = false;
  private sequence = 0;

  /** Transaction dışından okuyan biri fişi görür mü (commit edilmiş ya da tx'siz). */
  isCommitted(id: string): boolean {
    const transactionId = this.slipTransactions.get(id);
    return (
      transactionId === undefined ||
      this.transactions.get(transactionId) === "committed"
    );
  }

  next(): number {
    this.sequence += 1;
    return this.sequence;
  }

  /** GİB belge numarası: 3 karakter seri + 4 hane yıl + 9 hane sıra. */
  nextDocumentNumber(serial: string): string {
    if (!isValidNetsisSerial(serial)) {
      throw invalid(`serial '${serial}' must be 3 upper-case characters`);
    }
    const prefix = `${serial}${new Date().getFullYear()}`;
    const value = (this.numberCounters.get(prefix) ?? 0) + 1;
    this.numberCounters.set(prefix, value);
    return `${prefix}${String(value).padStart(9, "0")}`;
  }

  /** Sıradan türeyen, biçimce geçerli (v4) ve deterministik UUID. */
  nextEttn(): string {
    const hex = this.next().toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  }

  clear(): void {
    this.arps.clear();
    this.items.clear();
    this.slips.clear();
    this.eDocuments.clear();
    this.collections.clear();
    this.bankTransfers.length = 0;
    this.transactions.clear();
    this.slipTransactions.clear();
    this.numberCounters.clear();
    this.loseNextCommitResponse = false;
    this.sequence = 0;
  }
}

class StubArps implements NetsisArpsApi {
  constructor(private readonly store: NetsisStubStore) {}

  async findByCode(code: string): Promise<NetsisArp | null> {
    const arp = this.store.arps.get(code);
    return arp ? clone(arp) : null;
  }

  async create(arp: NetsisArp): Promise<NetsisArp> {
    const code = netsisArpCode(arp);
    if (this.store.arps.has(code)) throw conflict(`ARP ${code}`);
    this.store.arps.set(code, clone(arp));
    return clone(arp);
  }

  async update(code: string, arp: NetsisArp): Promise<NetsisArp> {
    if (!this.store.arps.has(code)) throw notFound(`ARP ${code}`);
    this.store.arps.set(code, clone(arp));
    return clone(arp);
  }

  async refreshEInvoiceFlags(code?: string): Promise<NetsisRawRecord> {
    if (code && !this.store.arps.has(code)) throw notFound(`ARP ${code}`);
    return { updated: code ? 1 : this.store.arps.size };
  }
}

class StubItems implements NetsisItemsApi {
  constructor(private readonly store: NetsisStubStore) {}

  async findByCode(code: string): Promise<NetsisItem | null> {
    const item = this.store.items.get(code);
    return item ? clone(item) : null;
  }

  async create(item: NetsisItem): Promise<NetsisItem> {
    const code = netsisItemCode(item);
    if (this.store.items.has(code)) throw conflict(`item ${code}`);
    this.store.items.set(code, clone(item));
    return clone(item);
  }

  ensureServiceItem(item: NetsisItem): Promise<NetsisItem> {
    return ensureNetsisItem(this, item);
  }
}

class StubItemSlips implements NetsisItemSlipsApi {
  constructor(private readonly store: NetsisStubStore) {}

  async create(
    slip: NetsisItemSlip,
    options?: NetsisCallOptions,
  ): Promise<NetsisItemSlip> {
    const header = slip.FatUst;
    if (!this.store.arps.has(header.CARI_KODU)) {
      throw invalid(`ARP ${header.CARI_KODU} does not exist`);
    }
    for (const line of slip.Kalems) {
      if (!this.store.items.has(line.STOK_KODU)) {
        throw invalid(`item ${line.STOK_KODU} does not exist`);
      }
    }
    const number =
      header.FATIRS_NO?.trim() ||
      this.store.nextDocumentNumber(STUB_DEFAULT_SERIAL);
    const id = slipId({ FaturaTip: slip.FaturaTip, FATIRS_NO: number });
    if (this.store.slips.has(id)) {
      throw conflict(`duplicate number ${number}`);
    }
    const stored = clone(slip);
    stored.FatUst.FATIRS_NO = number;
    this.store.slips.set(id, stored);
    if (options?.transactionId) {
      this.store.slipTransactions.set(id, options.transactionId);
    }
    return clone(stored);
  }

  async details(key: NetsisItemSlipKey): Promise<NetsisItemSlip | null> {
    const slip = this.store.slips.get(slipId(key));
    return slip ? clone(slip) : null;
  }

  async calculate(slip: NetsisItemSlip): Promise<NetsisSlipTotals> {
    return { ...sumNetsisSlipLines(slip.Kalems), raw: clone(slip) };
  }

  async html(key: NetsisItemSlipKey): Promise<string> {
    const slip = this.require(key);
    return `<html data-netsis-stub="true"><body>${escapeHtml(slip.FatUst.FATIRS_NO ?? "")}</body></html>`;
  }

  async newEInvoiceNumber(serial: string): Promise<string> {
    return this.store.nextDocumentNumber(serial);
  }

  async newEArchiveNumber(serial: string): Promise<string> {
    return this.store.nextDocumentNumber(serial);
  }

  async delete(key: NetsisItemSlipKey): Promise<void> {
    this.require(key);
    const document = this.store.eDocuments.get(slipId(key));
    if (
      document &&
      (document.state === "sent" || document.state === "accepted")
    ) {
      throw invalid(`${key.FATIRS_NO} has a sent e-document`);
    }
    this.store.slips.delete(slipId(key));
    this.store.eDocuments.delete(slipId(key));
    this.store.slipTransactions.delete(slipId(key));
  }

  /**
   * Canlıdaki gibi transaction dışı okuma: açık ya da geri alınmış bir
   * transaction'da yazılan fiş görünmez. İlk eşleşen (ilk açılan) döner.
   */
  async findByTrackingKey(
    trackingKey: string,
  ): Promise<NetsisItemSlipKey | null> {
    const key = trackingKey.trim();
    if (!key) return null;
    for (const [id, slip] of this.store.slips) {
      if (
        slip.FatUst[NETSIS_SLIP_TRACKING_KEY_FIELD] === key &&
        this.store.isCommitted(id)
      ) {
        return {
          FaturaTip: slip.FaturaTip,
          FATIRS_NO: slip.FatUst.FATIRS_NO ?? "",
        };
      }
    }
    return null;
  }

  private require(key: NetsisItemSlipKey): NetsisItemSlip {
    const slip = this.store.slips.get(slipId(key));
    if (!slip) throw notFound(`slip ${key.FATIRS_NO}`);
    return slip;
  }
}

class StubEDocuments implements NetsisEDocumentApi {
  constructor(private readonly store: NetsisStubStore) {}

  async send(
    request: NetsisEDocumentRequest,
  ): Promise<NetsisEDocumentSendResult> {
    const id = this.requireSlip(request);
    const existing = this.store.eDocuments.get(id);
    if (
      existing &&
      existing.state !== "rejected" &&
      existing.state !== "cancelled"
    ) {
      throw conflict(`e-document for ${request.FATIRS_NO}`);
    }
    const ettn = this.store.nextEttn();
    this.store.eDocuments.set(id, {
      ettn,
      state: "sent",
      slip: { FaturaTip: request.FaturaTip, FATIRS_NO: request.FATIRS_NO },
    });
    return { ettn, raw: { ETTN: ettn, Durum: "Gönderildi" } };
  }

  async check(request: NetsisEDocumentRequest): Promise<NetsisEDocumentStatus> {
    const id = this.requireSlip(request);
    const document = this.store.eDocuments.get(id);
    if (!document) return { state: "draft", ettn: null, raw: {} };
    return {
      state: document.state,
      ettn: document.ettn,
      raw: { ETTN: document.ettn, Durum: document.state },
    };
  }

  async cancelEArchive(request: NetsisEDocumentRequest): Promise<void> {
    const document = this.store.eDocuments.get(this.requireSlip(request));
    if (
      !document ||
      (document.state !== "sent" && document.state !== "accepted")
    ) {
      throw invalid(`${request.FATIRS_NO} has no sent e-archive document`);
    }
    document.state = "cancelled";
  }

  async show(request: NetsisEDocumentRequest): Promise<string> {
    const document = this.store.eDocuments.get(this.requireSlip(request));
    if (!document) throw notFound(`e-document for ${request.FATIRS_NO}`);
    return `<html data-netsis-stub="true"><body>${escapeHtml(request.FATIRS_NO)} ${document.ettn}</body></html>`;
  }

  private requireSlip(request: NetsisEDocumentRequest): string {
    const id = slipId(request);
    if (!this.store.slips.has(id)) throw notFound(`slip ${request.FATIRS_NO}`);
    return id;
  }
}

class StubReceipts implements NetsisReceiptsApi {
  constructor(private readonly store: NetsisStubStore) {}

  /**
   * Muhasebe senkronu kayıtları bir cariye yazılır: canlıdaki gibi cari önce
   * var olmalı (cari kodu verilmemiş kayıt — ör. hesaplar arası virman —
   * serbesttir). Numaralar (`STUB-TAH-n` / `STUB-HVL-n`) deterministiktir.
   */
  private requireArp(code: string | undefined): void {
    if (code && !this.store.arps.has(code)) {
      throw invalid(`ARP ${code} does not exist`);
    }
  }

  async createCollection(
    receipt: NetsisMixedReceipt,
  ): Promise<NetsisMixedReceipt> {
    this.requireArp(receipt.CARI_KOD);
    const id = `STUB-TAH-${this.store.next()}`;
    const stored = { ...clone(receipt), ID: id };
    this.store.collections.set(id, stored);
    return clone(stored);
  }

  async getCollection(id: string): Promise<NetsisMixedReceipt | null> {
    const receipt = this.store.collections.get(id);
    return receipt ? clone(receipt) : null;
  }

  async createBankTransfer(
    transfer: NetsisBankTransfer,
  ): Promise<NetsisBankTransfer> {
    this.requireArp(transfer.CARI_KOD);
    const stored = { ...clone(transfer), ID: `STUB-HVL-${this.store.next()}` };
    this.store.bankTransfers.push(stored);
    return clone(stored);
  }
}

class StubTransactions implements NetsisTransactionsApi {
  constructor(private readonly store: NetsisStubStore) {}

  async open(): Promise<string> {
    const id = `STUB-TX-${this.store.next()}`;
    this.store.transactions.set(id, "open");
    return id;
  }

  async commit(transactionId: string): Promise<void> {
    this.close(transactionId, "committed");
    // Kayıp yanıt: Netsis yazdı, biz duymadık. Commit KALICIDIR; çağıranın
    // sonraki rollback'i "açık değil" diye düşer (canlıda da öyle).
    if (this.store.loseNextCommitResponse) {
      this.store.loseNextCommitResponse = false;
      throw new NetsisRequestException(
        "network",
        null,
        "stub: commit applied but the response was lost (socket hang up)",
      );
    }
  }

  async rollback(transactionId: string): Promise<void> {
    this.close(transactionId, "rolledBack");
  }

  withTransaction<T>(
    fn: (tx: NetsisTransactionContext) => Promise<T>,
  ): Promise<T> {
    return runInNetsisTransaction(this, fn);
  }

  private close(
    transactionId: string,
    state: NetsisStubTransactionState,
  ): void {
    if (this.store.transactions.get(transactionId) !== "open") {
      throw invalid(`transaction ${transactionId} is not open`);
    }
    this.store.transactions.set(transactionId, state);
  }
}

class StubPublic implements NetsisPublicApi {
  /** Ağ yok: stub her zaman ayakta. */
  async ping(): Promise<void> {
    return undefined;
  }

  async version(): Promise<string> {
    return "stub";
  }

  async companyList(): Promise<NetsisRawRecord[]> {
    return [{ DbName: "STUB" }];
  }

  async authorizedBranches(): Promise<NetsisRawRecord[]> {
    return [{ BranchCode: 0 }];
  }
}

class StubQueries implements NetsisQueriesApi {
  /**
   * Bekçi ve parametre bağlama canlıdakiyle aynı; stub'da SQL tablosu
   * olmadığından sonuç boş (izleme anahtarı araması `itemSlips`'tedir).
   */
  async select(
    sql: string,
    params?: NetsisQueryParams,
  ): Promise<NetsisRawRecord[]> {
    bindNetsisQueryParams(assertNetsisReadOnlySelect(sql), params);
    return [];
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

@Injectable()
export class NetsisStubGateway implements NetsisGateway {
  readonly mode = "stub" as const;
  private readonly store = new NetsisStubStore();
  readonly arps: NetsisArpsApi = new StubArps(this.store);
  readonly items: NetsisItemsApi = new StubItems(this.store);
  readonly itemSlips: NetsisItemSlipsApi = new StubItemSlips(this.store);
  readonly eDocuments: NetsisEDocumentApi = new StubEDocuments(this.store);
  readonly receipts: NetsisReceiptsApi = new StubReceipts(this.store);
  readonly transactions: NetsisTransactionsApi = new StubTransactions(
    this.store,
  );
  readonly publicApi: NetsisPublicApi = new StubPublic();
  readonly queries: NetsisQueriesApi = new StubQueries();

  async ping(): Promise<NetsisPingResult> {
    return { mode: this.mode, version: "stub", authenticated: true };
  }

  /** Testler için: saklanan her şeyin kopyası. */
  snapshot(): NetsisStubSnapshot {
    return clone({
      arps: [...this.store.arps.values()],
      items: [...this.store.items.values()],
      slips: [...this.store.slips.values()],
      eDocuments: [...this.store.eDocuments.values()],
      collections: [...this.store.collections.values()],
      bankTransfers: [...this.store.bankTransfers],
      transactions: [...this.store.transactions].map(([id, state]) => ({
        id,
        state,
      })),
    });
  }

  /** Testler için: GİB'in yanıtını taklit et (ör. kabul ya da red). */
  setEDocumentState(ettn: string, state: NetsisEDocumentState): void {
    const document = [...this.store.eDocuments.values()].find(
      (candidate) => candidate.ettn === ettn,
    );
    if (!document) throw notFound(`e-document ${ettn}`);
    document.state = state;
  }

  /**
   * Testler için: bir sonraki `commit` UYGULANIR (fiş kalıcıdır) ama yanıtı
   * kaybolur — `network` sınıfında hata fırlar. "Netsis transaction'ı commit
   * etti, HTTP yanıtı bize ulaşmadı" senaryosu; tek seferliktir.
   */
  loseNextCommitResponse(): void {
    this.store.loseNextCommitResponse = true;
  }

  reset(): void {
    this.store.clear();
  }
}
