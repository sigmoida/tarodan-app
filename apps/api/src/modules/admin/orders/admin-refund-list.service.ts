import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  ADMIN_REFUND_BUCKETS,
  EXPORT_CATALOGS,
  REFUND_ATTEMPT_IN_FLIGHT_STATUSES,
  type AdminRefundCounts,
  type AdminRefundRow,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import {
  paginateMerged,
  type ListQuery,
  type PaginatedResult,
  type SortDirection,
} from "../../../common/list";
import { ExportListService, type ExportFile } from "../../../common/export";
import {
  REFUND_REQUEST_KEY_PREFIX,
  refundRequestAttemptKey,
  refundRequestIdOf,
} from "../../invoicing/helpers/refund-request-key";
import {
  invoiceTypesOfSourceKind,
  reversalRefundAttemptIdOf,
  reversedInvoiceIdOf,
} from "../../invoicing/invoice/invoice-source";
import {
  refundBucketNeedsAttempts,
  refundListScopeOf,
  refundListSourceWheres,
  type RefundBucketContext,
  type RefundListQuery,
} from "./helpers/refund-list-where";
import {
  REFUND_ROW_ATTEMPT_SELECT,
  REFUND_ROW_INVOICE_SELECT,
  REFUND_ROW_SELECT,
  TRADE_REFUND_SELECT,
  type RefundRowAttempt,
  type RefundRowInvoice,
} from "./helpers/refund-list-select";
import {
  refundHeadComparator,
  tradeHeadTake,
  tradeRefundHeads,
  type RefundHead,
} from "./helpers/refund-list-heads";
import {
  mapRefundRequestRow,
  mapTradeRefundRows,
} from "./helpers/refund-list-row.mapper";
import {
  refundExportFilters,
  refundExportRecord,
  refundExportTotals,
} from "./helpers/refund-list-export";

/**
 * Excel'in kayıt tavanı — iptallerle aynı gerekçe: birleşik sayfalama
 * (`paginateMerged`) N. sayfa için her kaynaktan N × sayfa kadar baş okur.
 * Aşarsa dosya ilk N kaydı taşır ve `X-Export-Truncated-At` döner.
 */
export const REFUND_EXPORT_ROW_CAP = 5000;

/** Liste isteği: kapsam + filtreler + sayfalama + (yalnız iade anı) sıralama. */
export type RefundListRequest = RefundListQuery &
  Pick<ListQuery, "page" | "limit" | "sortOrder">;

/**
 * Admin İadeler ekranı: liste, kova sayaçları, Excel.
 *
 * Satır = iade talebi (direkt satış / teklif) ya da takasın bir tarafı (takas
 * başına iki satır). Kaynaklar, sekme ve kova tanımları
 * `helpers/refund-list-where.ts`'te; liste, sayaçlar ve Excel aynı builder'ı
 * kullanır. Sıralama iade anına göredir (varsayılan yeni → eski); takasın anı
 * kapanışıdır, açık takas en yeni sayılır (bkz. `refund-list-heads.ts`).
 *
 * Eski `GET /admin/refund-requests` yanıtı (ham talep satırı) yerine
 * `AdminRefundRow` döner; talep dosyası (`/:id`) değişmedi.
 */
@Injectable()
export class AdminRefundListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ExportListService,
  ) {}

  async list(
    query: RefundListRequest,
  ): Promise<PaginatedResult<AdminRefundRow>> {
    const { tab, bucket, filters } = refundListScopeOf(query);
    const ctx = await this.bucketContext(refundBucketNeedsAttempts(bucket));
    const { request, trade } = refundListSourceWheres(
      tab,
      bucket,
      filters,
      ctx,
    );
    const dir: SortDirection = query.sortOrder === "asc" ? "asc" : "desc";

    const sources = [
      ...(request ? [this.requestSource(request, dir)] : []),
      ...(trade ? [this.tradeSource(trade, dir)] : []),
    ];
    const page = await paginateMerged<RefundHead>(
      sources,
      refundHeadComparator(dir),
      query,
    );
    return { ...page, data: await this.hydrate(page.data) };
  }

  /**
   * Sekmenin kova sayaçları — listeyle AYNI `where` (aynı builder, aynı
   * önceden okunan deneme kümesi), tek `$transaction`. Takas iki satır
   * olduğundan takas sayısı iki kez sayılır. "Tümü" sekmenin toplamıdır.
   */
  async counts(query: RefundListQuery): Promise<AdminRefundCounts> {
    const { tab, filters } = refundListScopeOf(query);
    const ctx = await this.bucketContext(true);

    const plan = ADMIN_REFUND_BUCKETS.map((bucket) => ({
      bucket,
      wheres: refundListSourceWheres(tab, bucket, filters, ctx),
    }));
    const queries: Prisma.PrismaPromise<number>[] = [];
    const slots = plan.map(({ wheres }) => {
      const slot: { request?: number; trade?: number } = {};
      if (wheres.request) {
        slot.request = queries.length;
        queries.push(
          this.prisma.refundRequest.count({ where: wheres.request }),
        );
      }
      if (wheres.trade) {
        slot.trade = queries.length;
        queries.push(this.prisma.trade.count({ where: wheres.trade }));
      }
      return slot;
    });
    const results = await this.prisma.$transaction(queries);

    const counts = Object.fromEntries(
      ADMIN_REFUND_BUCKETS.map((bucket) => [bucket, 0]),
    ) as AdminRefundCounts;
    plan.forEach(({ bucket }, i) => {
      const slot = slots[i];
      const requests =
        slot.request !== undefined ? (results[slot.request] ?? 0) : 0;
      const trades = slot.trade !== undefined ? (results[slot.trade] ?? 0) : 0;
      counts[bucket] = requests + trades * 2;
    });
    return counts;
  }

  /**
   * Geçerli filtrenin Excel dosyası — listeyle AYNI kaynak, sekme/kova, filtre
   * ve sıralama; liste sayfaları en büyük sayfa boyuyla sırayla okunur. Takas
   * satırları listede olduğu gibi taraf başına iki satırdır.
   */
  async export(
    query: RefundListRequest,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.refundRequests,
      locale,
      slug: "iadeler",
      titleKey: "admin.operations.refunds.export.sheetName",
      filters: refundExportFilters(query),
      sort: { sortBy: "createdAt", sortOrder: query.sortOrder },
      cap: REFUND_EXPORT_ROW_CAP,
      fetchPage: async ({ page, take }) =>
        (await this.list({ ...query, page, limit: take })).data,
      map: refundExportRecord,
      totals: refundExportTotals,
      audit: {
        actorId,
        action: "refund_requests_export",
        entityType: "RefundRequest",
        query,
      },
    });
  }

  // ── Kova bağlamı ───────────────────────────────────────────────────────────

  /**
   * Süren iade denemesi olan taleplerin id'leri. Deneme talebe ilişkiyle değil
   * `refund-request:<id>` anahtarıyla bağlıdır; yalnız kesinleşmemiş denemeler
   * okunur (küçük küme). Kovası denemeye bakmayan istekte hiç okunmaz.
   */
  private async bucketContext(needed: boolean): Promise<RefundBucketContext> {
    if (!needed) return { inFlightRequestIds: [] };
    const attempts = await this.prisma.refundAttempt.findMany({
      where: {
        idempotencyKey: { startsWith: REFUND_REQUEST_KEY_PREFIX },
        status: { in: [...REFUND_ATTEMPT_IN_FLIGHT_STATUSES] },
      },
      select: { idempotencyKey: true },
    });
    return {
      inFlightRequestIds: attempts.flatMap((attempt) => {
        const id = refundRequestIdOf(attempt.idempotencyKey);
        return id ? [id] : [];
      }),
    };
  }

  // ── Kaynaklar ──────────────────────────────────────────────────────────────

  private requestSource(
    where: Prisma.RefundRequestWhereInput,
    dir: SortDirection,
  ) {
    return {
      count: () => this.prisma.refundRequest.count({ where }),
      head: async (take: number): Promise<RefundHead[]> =>
        (
          await this.prisma.refundRequest.findMany({
            where,
            select: { id: true, createdAt: true },
            orderBy: [{ createdAt: dir }, { id: "asc" }],
            take,
          })
        ).map((row) => ({
          kind: "request" as const,
          id: row.id,
          at: row.createdAt,
        })),
    };
  }

  /** Takas başına iki satır: sayaç iki katı, baş okuması yarısı kadar takas. */
  private tradeSource(where: Prisma.TradeWhereInput, dir: SortDirection) {
    return {
      count: async () => (await this.prisma.trade.count({ where })) * 2,
      head: async (take: number): Promise<RefundHead[]> =>
        tradeRefundHeads(
          await this.prisma.trade.findMany({
            where,
            select: { id: true, cancelledAt: true },
            orderBy: [
              {
                cancelledAt: {
                  sort: dir,
                  nulls: dir === "desc" ? "first" : "last",
                },
              },
              { updatedAt: dir },
              { id: "asc" },
            ],
            take: tradeHeadTake(take),
          }),
          take,
        ),
    };
  }

  // ── Satırların doldurulması ────────────────────────────────────────────────

  private async hydrate(
    heads: readonly RefundHead[],
  ): Promise<AdminRefundRow[]> {
    if (heads.length === 0) return [];
    const requestIds = heads
      .filter((head) => head.kind === "request")
      .map((head) => head.id);
    const tradeIds = [
      ...new Set(
        heads.filter((head) => head.kind === "trade").map((head) => head.id),
      ),
    ];

    const [requests, attempts, trades] = await Promise.all([
      requestIds.length
        ? this.prisma.refundRequest.findMany({
            where: { id: { in: requestIds } },
            select: REFUND_ROW_SELECT,
          })
        : Promise.resolve([]),
      requestIds.length
        ? this.prisma.refundAttempt.findMany({
            where: {
              idempotencyKey: { in: requestIds.map(refundRequestAttemptKey) },
            },
            select: REFUND_ROW_ATTEMPT_SELECT,
          })
        : Promise.resolve([] as RefundRowAttempt[]),
      tradeIds.length
        ? this.prisma.trade.findMany({
            where: { id: { in: tradeIds } },
            select: TRADE_REFUND_SELECT,
          })
        : Promise.resolve([]),
    ]);

    const [requestInvoices, tradeInvoices] = await Promise.all([
      this.returnInvoicesByAttempt(attempts.map((attempt) => attempt.id)),
      this.returnInvoicesByCashPayment(
        trades.flatMap((trade) => trade.cashPayments.map((row) => row.id)),
      ),
    ]);

    const attemptByRequest = new Map<string, RefundRowAttempt>();
    for (const attempt of attempts) {
      const id = refundRequestIdOf(attempt.idempotencyKey);
      if (id) attemptByRequest.set(id, attempt);
    }
    const requestById = new Map(requests.map((row) => [row.id, row]));
    const tradeRowsById = new Map(
      trades.map((trade) => [
        trade.id,
        mapTradeRefundRows(trade, {
          returnInvoiceByCashPayment: tradeInvoices,
        }),
      ]),
    );

    return heads.flatMap((head): AdminRefundRow[] => {
      if (head.kind === "trade") {
        const row = tradeRowsById
          .get(head.id)
          ?.find((candidate) => candidate.trade?.role === head.role);
        return row ? [row] : [];
      }
      const request = requestById.get(head.id);
      if (!request) return [];
      const attempt = attemptByRequest.get(request.id) ?? null;
      return [
        mapRefundRequestRow(request, {
          attempt,
          returnInvoice: attempt
            ? (requestInvoices.get(attempt.id) ?? null)
            : null,
        }),
      ];
    });
  }

  /**
   * Talebin iade faturası: iade denemesiyle kesilen `return_invoice`
   * (`sourceId = <faturaId>:<denemeId>`). Bir deneme birden çok belgeyi
   * (komisyon, hizmet bedeli…) ters çevirebilir; satır İLK kesileni gösterir.
   */
  private async returnInvoicesByAttempt(
    attemptIds: readonly string[],
  ): Promise<Map<string, RefundRowInvoice>> {
    const byAttempt = new Map<string, RefundRowInvoice>();
    if (attemptIds.length === 0) return byAttempt;
    const invoices = await this.prisma.fiscalInvoice.findMany({
      where: {
        type: "return_invoice",
        OR: attemptIds.map((id) => ({ sourceId: { endsWith: `:${id}` } })),
      },
      select: REFUND_ROW_INVOICE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const invoice of invoices) {
      const attemptId = reversalRefundAttemptIdOf(invoice.sourceId);
      if (attemptId && !byAttempt.has(attemptId)) {
        byAttempt.set(attemptId, invoice);
      }
    }
    return byAttempt;
  }

  /**
   * Takas tarafının iade faturası: tarafın ödeme satırına kesilen hizmet /
   * kargo belgesinin (`trade_*`, `sourceId = TradeCashPayment.id`) iade
   * faturası (`sourceId = <faturaId>` ya da `<faturaId>:…`). İlki gösterilir.
   */
  private async returnInvoicesByCashPayment(
    cashPaymentIds: readonly string[],
  ): Promise<Map<string, RefundRowInvoice>> {
    const byPayment = new Map<string, RefundRowInvoice>();
    if (cashPaymentIds.length === 0) return byPayment;
    const originals = await this.prisma.fiscalInvoice.findMany({
      where: {
        type: { in: invoiceTypesOfSourceKind("trade_payment") },
        sourceId: { in: [...cashPaymentIds] },
      },
      select: { id: true, sourceId: true },
    });
    if (originals.length === 0) return byPayment;
    const paymentOfInvoice = new Map(
      originals.map((invoice) => [invoice.id, invoice.sourceId]),
    );
    const ids = [...paymentOfInvoice.keys()];
    const returns = await this.prisma.fiscalInvoice.findMany({
      where: {
        type: "return_invoice",
        OR: [
          { sourceId: { in: ids } },
          ...ids.map((id) => ({ sourceId: { startsWith: `${id}:` } })),
        ],
      },
      select: REFUND_ROW_INVOICE_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const invoice of returns) {
      const paymentId = paymentOfInvoice.get(
        reversedInvoiceIdOf(invoice.sourceId),
      );
      if (paymentId && !byPayment.has(paymentId)) {
        byPayment.set(paymentId, invoice);
      }
    }
    return byPayment;
  }
}
