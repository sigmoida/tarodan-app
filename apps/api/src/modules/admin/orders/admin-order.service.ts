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
import { AdminAuditService } from "../ops/admin-audit.service";
import { AdminOrderCountsQueryDto, AdminOrderQueryDto } from "../dto";
import {
  paginate,
  paginateMerged,
  resolveOrderBy,
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
  LIST_INVOICE_SELECT,
  LIST_LINE_SELECT,
  LIST_OFFER_SELECT,
  ORDER_INVOICE_TYPES,
  type ListInvoice,
  type ListLine,
} from "./helpers/order-list-select";
import {
  mapCartRow,
  mapOfferRow,
  type RowMapContext,
} from "./helpers/order-list-row.mapper";
import { resolveProductImageUrl } from "./helpers/product-image-url";

/** Sepet sekmelerinde birleşik sıralamanın okuduğu alanlar. */
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
 * Satır = sepet (doğrudan satışta CheckoutGroup, teklifte tekil sipariş) ya da
 * teklif sekmesinde teklifin kendisi. Kova tanımları `@tarodan/types`
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

  async getOrders(
    query: AdminOrderQueryDto,
  ): Promise<PaginatedResult<AdminOrderListRow>> {
    const now = new Date();
    const { tab, bucket, filters } = orderListScopeOf(query);
    const sources = orderListSourceWheres(tab, bucket, filters, now);
    if (sources.offer) return this.listOffers(sources.offer, query, now);
    return this.listCarts(
      sources.group ?? {},
      sources.loose ?? {},
      filters,
      query,
      now,
    );
  }

  /**
   * Her sekmenin her kovasının sayacı — tek istek, tek `$transaction`. Aynı
   * `where`'li sorgu (ör. tüm/doğrudan sekmelerinin grup kaynağı) bir kez
   * koşar. Sekme toplamı "Tümü" kovasının sayacıdır — listeyle aynı `where`.
   */
  async getOrderCounts(
    query: AdminOrderCountsQueryDto,
  ): Promise<AdminOrderCounts> {
    const now = new Date();
    const { filters } = orderListScopeOf(query);

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
        const { group, loose, offer } = orderListSourceWheres(
          tab,
          bucket,
          filters,
          now,
        );
        const keys: string[] = [];
        if (group)
          keys.push(
            enqueue("group", group, () =>
              this.prisma.checkoutGroup.count({ where: group }),
            ),
          );
        if (loose)
          keys.push(
            enqueue("order", loose, () =>
              this.prisma.order.count({ where: loose }),
            ),
          );
        if (offer)
          keys.push(
            enqueue("offer", offer, () =>
              this.prisma.offer.count({ where: offer }),
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

  // ── Teklif sekmesi: tek kaynak (Offer) ────────────────────────────────────

  private async listOffers(
    where: Prisma.OfferWhereInput,
    query: AdminOrderQueryDto,
    now: Date,
  ): Promise<PaginatedResult<AdminOrderListRow>> {
    const orderBy = resolveOrderBy<Prisma.OfferOrderByWithRelationInput>(
      "Offer",
      query,
      {
        defaultSort: { createdAt: "desc" },
        sortMap: {
          number: (dir) => ({ order: { orderNumber: dir } }),
          orderNumber: (dir) => ({ order: { orderNumber: dir } }),
          totalAmount: (dir) => ({ amount: dir }),
        },
      },
    );
    const page = await paginate(
      this.prisma.offer,
      { where, select: LIST_OFFER_SELECT, orderBy },
      query,
    );
    const orders = page.data.flatMap((offer) =>
      offer.order ? [offer.order] : [],
    );
    const ctx = await this.rowContext(orders, now);
    return { ...page, data: page.data.map((offer) => mapOfferRow(offer, ctx)) };
  }

  // ── Sepet sekmeleri: CheckoutGroup + grupsuz sipariş ──────────────────────

  private async listCarts(
    groupWhere: Prisma.CheckoutGroupWhereInput,
    looseWhere: Prisma.OrderWhereInput,
    filters: OrderListFilters,
    query: AdminOrderQueryDto,
    now: Date,
  ): Promise<PaginatedResult<AdminOrderListRow>> {
    const sortKey = CART_SORT_ALIASES[query.sortBy ?? ""] ?? "createdAt";
    const dir: SortDirection =
      query.sortBy && query.sortOrder === "asc" ? "asc" : "desc";

    const page = await paginateMerged<CartHeadRow>(
      [
        {
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
        },
        {
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
        },
      ],
      cartComparator(sortKey, dir),
      query,
    );

    const groupIds = page.data
      .filter((h) => h.kind === "group")
      .map((h) => h.id);
    const orderIds = page.data
      .filter((h) => h.kind === "order")
      .map((h) => h.id);
    const lines =
      page.data.length === 0
        ? []
        : await this.prisma.order.findMany({
            where: {
              OR: [
                ...(groupIds.length
                  ? [
                      {
                        AND: [
                          { checkoutGroupId: { in: groupIds } },
                          orderLineScopeWhere(filters),
                        ],
                      },
                    ]
                  : []),
                ...(orderIds.length ? [{ id: { in: orderIds } }] : []),
              ],
            },
            select: LIST_LINE_SELECT,
            orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
          });

    const byCart = new Map<string, ListLine[]>();
    for (const line of lines) {
      const key = line.checkoutGroupId ?? line.id;
      byCart.set(key, [...(byCart.get(key) ?? []), line]);
    }
    const ctx = await this.rowContext(lines, now);
    return {
      ...page,
      data: page.data.flatMap((head) => {
        const members = byCart.get(head.id);
        return members?.length ? [mapCartRow(head, members, ctx)] : [];
      }),
    };
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
      ? await this.prisma.elogoInvoice.findMany({
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
