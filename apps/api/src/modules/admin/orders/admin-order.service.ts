import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ADMIN_ORDER_TABS,
  ADMIN_ORDER_ALL_BUCKET,
  ADMIN_ORDER_TAB_BUCKETS,
  type AdminOrderBucket,
  type AdminOrderCounts,
  type AdminOrderTab,
  type AdminOrderListRow,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import { resolvePaytrOidMatch } from "../../payment/helpers/paytr-oid-search";
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminOrderCountsQueryDto, AdminOrderQueryDto } from "../dto";
import {
  paginateMerged,
  type MergedListSource,
  type PaginatedResult,
  type SortDirection,
} from "../../../common/list";
import {
  orderLineScopeWhere,
  orderListScopeOf,
  orderListSourceWheres,
  type OrderListFilters,
} from "./helpers/order-list-where";
import {
  BUCKET_LINE_SELECT,
  LIST_INVOICE_SELECT,
  LIST_LINE_SELECT,
  ORDER_INVOICE_TYPES,
  type BucketLine,
  type ListInvoice,
  type ListLine,
} from "./helpers/order-list-select";
import {
  mapCartRow,
  type RowMapContext,
} from "./helpers/order-list-row.mapper";
import { resolveProductImageUrl } from "./helpers/product-image-url";

/** Rows grouped by `keyOf`, in input order within each group. */
function groupByKey<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** The fields the cart tabs' merged sort reads. */
interface CartHeadRow {
  kind: "group" | "order";
  id: string;
  number: string;
  totalAmount: number;
  buyerName: string;
  createdAt: Date;
}

/** Panelin sıralanabilir kolonları → iki kaynaktaki karşılıkları. */
type CartSortKey = "createdAt" | "number" | "totalAmount" | "buyer.displayName";

const CART_SORT_ALIASES: Record<string, CartSortKey> = {
  createdAt: "createdAt",
  number: "number",
  // Eski panel sipariş numarasıyla sıralardı; satır numarası aynı kolondur.
  orderNumber: "number",
  totalAmount: "totalAmount",
  "buyer.displayName": "buyer.displayName",
};

/**
 * Admin sipariş listesi ve alt sekme sayaçları.
 *
 * Satır = sepet (doğrudan satışta CheckoutGroup, teklifte tekil sipariş).
 * Siparişe dönmemiş teklifler bu listede değildir — panelin Teklifler sekmesi
 * `GET /admin/offers`'ı okur. Kova tanımları `@tarodan/types`
 * `order-buckets.ts`'te; Prisma karşılıkları `helpers/order-bucket-where.ts`'te
 * ve liste ile sayaçlar AYNI builder'ı kullanır.
 */
@Injectable()
export class AdminOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    @Optional()
    private readonly storageService: StorageService,
  ) {}

  /** Liste/sayaç kapsamı + (PayTR id'si aranıyorsa) istek başına tek çözümleme. */
  private async scopeOf(query: AdminOrderQueryDto | AdminOrderCountsQueryDto) {
    const scope = orderListScopeOf(query);
    const paytr = await resolvePaytrOidMatch(this.prisma, query.search);
    return { ...scope, filters: { ...scope.filters, paytr } };
  }

  async getOrders(
    query: AdminOrderQueryDto,
  ): Promise<PaginatedResult<AdminOrderListRow>> {
    const { tab, bucket, filters } = await this.scopeOf(query);
    const sources = orderListSourceWheres(tab, bucket, filters);
    return this.listCarts(sources, filters, query, new Date());
  }

  /**
   * Her sekmenin her kovasının sayacı — tek istek, tek `$transaction`. Aynı
   * `where`'li sorgu (ör. tüm/doğrudan sekmelerinin grup kaynağı) bir kez
   * koşar. Sekme toplamı "Tümü" kovasının sayacıdır — listeyle aynı `where`.
   */
  async getOrderCounts(
    query: AdminOrderCountsQueryDto,
  ): Promise<AdminOrderCounts> {
    const { filters } = await this.scopeOf(query);

    const queries = new Map<string, Prisma.PrismaPromise<number>>();
    const plan: Array<{
      tab: AdminOrderTab;
      bucket: AdminOrderBucket;
      keys: string[];
    }> = [];
    const enqueue = (
      source: string,
      where: unknown,
      run: () => Prisma.PrismaPromise<number>,
    ) => {
      const key = `${source}:${JSON.stringify(where)}`;
      if (!queries.has(key)) queries.set(key, run());
      return key;
    };

    for (const tab of ADMIN_ORDER_TABS) {
      for (const bucket of ADMIN_ORDER_TAB_BUCKETS[tab]) {
        const { group, loose } = orderListSourceWheres(tab, bucket, filters);
        const keys: string[] = [];
        if (group)
          keys.push(
            enqueue("group", group, () =>
              this.prisma.checkoutGroup.count({ where: group }),
            ),
          );
        keys.push(
          enqueue("order", loose, () =>
            this.prisma.order.count({ where: loose }),
          ),
        );
        plan.push({ tab, bucket, keys });
      }
    }

    const keys = [...queries.keys()];
    const results = await this.prisma.$transaction([...queries.values()]);
    const countOf = new Map(keys.map((key, i) => [key, results[i] ?? 0]));

    const counts = Object.fromEntries(
      ADMIN_ORDER_TABS.map((tab) => [tab, { total: 0, buckets: {} }]),
    ) as AdminOrderCounts;
    for (const { tab, bucket, keys: parts } of plan) {
      const n = parts.reduce((sum, key) => sum + (countOf.get(key) ?? 0), 0);
      counts[tab].buckets[bucket] = n;
      if (bucket === ADMIN_ORDER_ALL_BUCKET) counts[tab].total = n;
    }
    return counts;
  }

  // ── Cart tabs: CheckoutGroup + groupless order ─────────────────────────────

  /**
   * The tab's sources are paged with one merged sort. The group source exists
   * only in tabs that carry direct sales (in "Offers turned into orders" every
   * row is a groupless single order).
   */
  private async listCarts(
    sources: {
      group?: Prisma.CheckoutGroupWhereInput;
      loose: Prisma.OrderWhereInput;
    },
    filters: OrderListFilters,
    query: AdminOrderQueryDto,
    now: Date,
  ): Promise<PaginatedResult<AdminOrderListRow>> {
    const sortKey = CART_SORT_ALIASES[query.sortBy ?? ""] ?? "createdAt";
    const dir: SortDirection =
      query.sortBy && query.sortOrder === "asc" ? "asc" : "desc";
    const { group: groupWhere, loose: looseWhere } = sources;

    const looseSource: MergedListSource<CartHeadRow> = {
      count: () => this.prisma.order.count({ where: looseWhere }),
      head: async (take) =>
        (
          await this.prisma.order.findMany({
            where: looseWhere,
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              createdAt: true,
              buyer: { select: { displayName: true } },
            },
            orderBy: looseOrderBy(sortKey, dir),
            take,
          })
        ).map((order) => ({
          kind: "order" as const,
          id: order.id,
          number: order.orderNumber,
          totalAmount: Number(order.totalAmount),
          buyerName: order.buyer?.displayName ?? "",
          createdAt: order.createdAt,
        })),
    };
    const groupSource: MergedListSource<CartHeadRow> | null = groupWhere
      ? {
          count: () => this.prisma.checkoutGroup.count({ where: groupWhere }),
          head: async (take) =>
            (
              await this.prisma.checkoutGroup.findMany({
                where: groupWhere,
                select: {
                  id: true,
                  groupNumber: true,
                  totalAmount: true,
                  createdAt: true,
                  buyer: { select: { displayName: true } },
                },
                orderBy: groupOrderBy(sortKey, dir),
                take,
              })
            ).map((group) => ({
              kind: "group" as const,
              id: group.id,
              number: group.groupNumber,
              totalAmount: Number(group.totalAmount),
              buyerName: group.buyer?.displayName ?? "",
              createdAt: group.createdAt,
            })),
        }
      : null;

    const page = await paginateMerged<CartHeadRow>(
      groupSource ? [groupSource, looseSource] : [looseSource],
      cartComparator(sortKey, dir),
      query,
    );

    const groupIds = page.data
      .filter((h) => h.kind === "group")
      .map((h) => h.id);
    const orderIds = page.data
      .filter((h) => h.kind === "order")
      .map((h) => h.id);
    const lineScope = orderLineScopeWhere(filters);
    const [lines, scopedBuckets] = await Promise.all([
      page.data.length === 0
        ? []
        : this.prisma.order.findMany({
            where: {
              OR: [
                ...(groupIds.length
                  ? [
                      {
                        AND: [{ checkoutGroupId: { in: groupIds } }, lineScope],
                      },
                    ]
                  : []),
                ...(orderIds.length ? [{ id: { in: orderIds } }] : []),
              ],
            },
            select: LIST_LINE_SELECT,
            orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
          }),
      this.groupBucketLines(groupIds, lineScope),
    ]);

    const byCart = groupByKey<ListLine>(
      lines,
      (line) => line.checkoutGroupId ?? line.id,
    );
    const ctx = await this.rowContext(lines, now);
    return {
      ...page,
      data: page.data.flatMap((head) => {
        const members = byCart.get(head.id);
        return members?.length
          ? [mapCartRow(head, members, ctx, scopedBuckets?.get(head.id))]
          : [];
      }),
    };
  }

  /**
   * Every line of the page's groups, narrowed to what the bucket reads — only
   * when a deep-link scope (user / product) hides some lines of a group, so
   * the row's bucket still describes the whole cart, like the bucket filter.
   * Without a scope the shown lines are all the lines (`undefined`).
   */
  private async groupBucketLines(
    groupIds: readonly string[],
    lineScope: Prisma.OrderWhereInput,
  ): Promise<Map<string, BucketLine[]> | undefined> {
    if (groupIds.length === 0 || Object.keys(lineScope).length === 0) {
      return undefined;
    }
    const lines = await this.prisma.order.findMany({
      where: { checkoutGroupId: { in: [...groupIds] } },
      select: BUCKET_LINE_SELECT,
    });
    // The where guarantees a group id; `id` only satisfies the key type.
    return groupByKey<BucketLine>(
      lines,
      (line) => line.checkoutGroupId ?? line.id,
    );
  }

  // ── Ortak ──────────────────────────────────────────────────────────────────

  /**
   * Sayfadaki paketlerin e-belgeleri TEK sorguda: kaynak paket id'si (güncel)
   * ya da sipariş id'si (paket öncesi eski belgeler).
   */
  private async rowContext(
    orders: ReadonlyArray<{ id: string; packageId: string | null }>,
    now: Date,
  ): Promise<RowMapContext> {
    const sourceIds = [
      ...new Set(
        orders.flatMap((order) =>
          order.packageId ? [order.packageId, order.id] : [order.id],
        ),
      ),
    ];
    const invoices = sourceIds.length
      ? await this.prisma.fiscalInvoice.findMany({
          where: {
            sourceId: { in: sourceIds },
            type: { in: ORDER_INVOICE_TYPES },
          },
          select: LIST_INVOICE_SELECT,
          orderBy: { createdAt: "asc" },
        })
      : [];
    const invoicesBySource = new Map<string, ListInvoice[]>();
    for (const invoice of invoices) {
      invoicesBySource.set(invoice.sourceId, [
        ...(invoicesBySource.get(invoice.sourceId) ?? []),
        invoice,
      ]);
    }
    return {
      now,
      invoicesBySource,
      imageUrl: (key) =>
        resolveProductImageUrl(key, (k) =>
          this.storageService?.getPublicAssetUrl(k),
        ),
    };
  }
}

/**
 * İki kaynağın DB sırası ile bellekteki birleştirme sırası AYNI tanımdır:
 * birincil anahtar, sonra createdAt DESC, sonra id. `paginateMerged` kaynak
 * sırasını korur (yeniden sıralamaz); metin kolonlarında JS ile DB harmanlaması
 * ayrışırsa yalnız kaynaklar arası serpiştirme kayar, sayfa sınırı bozulmaz.
 */
function groupOrderBy(
  key: CartSortKey,
  dir: SortDirection,
): Prisma.CheckoutGroupOrderByWithRelationInput[] {
  const primary: Prisma.CheckoutGroupOrderByWithRelationInput =
    key === "number"
      ? { groupNumber: dir }
      : key === "totalAmount"
        ? { totalAmount: dir }
        : key === "buyer.displayName"
          ? { buyer: { displayName: dir } }
          : { createdAt: dir };
  return [primary, { createdAt: "desc" }, { id: "asc" }];
}

function looseOrderBy(
  key: CartSortKey,
  dir: SortDirection,
): Prisma.OrderOrderByWithRelationInput[] {
  const primary: Prisma.OrderOrderByWithRelationInput =
    key === "number"
      ? { orderNumber: dir }
      : key === "totalAmount"
        ? { totalAmount: dir }
        : key === "buyer.displayName"
          ? { buyer: { displayName: dir } }
          : { createdAt: dir };
  return [primary, { createdAt: "desc" }, { id: "asc" }];
}

function cartComparator(key: CartSortKey, dir: SortDirection) {
  const sign = dir === "asc" ? 1 : -1;
  return (a: CartHeadRow, b: CartHeadRow): number => {
    const primary =
      key === "number"
        ? a.number.localeCompare(b.number, "tr")
        : key === "totalAmount"
          ? a.totalAmount - b.totalAmount
          : key === "buyer.displayName"
            ? a.buyerName.localeCompare(b.buyerName, "tr")
            : a.createdAt.getTime() - b.createdAt.getTime();
    if (primary !== 0) return primary * sign;
    const byDate = b.createdAt.getTime() - a.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
