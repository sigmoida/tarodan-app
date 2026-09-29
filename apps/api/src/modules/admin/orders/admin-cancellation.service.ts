import { Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ADMIN_CANCELLATION_BUCKETS,
  ADMIN_CANCELLATION_TABS,
  type AdminCancellationCounts,
  type AdminCancellationRow,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { StorageService } from "../../storage/storage.service";
import {
  ADMIN_LIST_MAX_LIMIT,
  paginateMerged,
  type ListQuery,
  type PaginatedResult,
  type SortDirection,
} from "../../../common/list";
import {
  cancellationScopeOf,
  cancellationSourceWheres,
  type CancellationListQuery,
} from "./helpers/cancellation-where";
import {
  CANCELLATION_LINE_SELECT,
  CANCELLATION_TRADE_SELECT,
  type CancellationLine,
} from "./helpers/cancellation-select";
import {
  mapCancelledCartRow,
  mapCancelledTradeRow,
} from "./helpers/cancellation-row.mapper";
import type { RowMapContext } from "./helpers/order-list-row.mapper";
import { resolveProductImageUrl } from "./helpers/product-image-url";
import {
  cancellationHeadComparator,
  type CancellationHead,
} from "./helpers/cancellation-heads";
import { cancellationExportSheet } from "./helpers/cancellation-export";
import { toXlsx } from "../../../common/helpers/tabular-export";
import { translateMessage } from "../../i18n/translate";
import type { Locale } from "@tarodan/i18n";

/**
 * Excel'in satır (sepet/sipariş/takas) tavanı. Aşarsa dosya ilk N satırı taşır
 * ve `X-Export-Truncated-At` başlığı döner — sessiz kırpma yok.
 */
export const CANCELLATION_EXPORT_ROW_CAP = 5000;

/** Liste isteği: kapsam + filtreler + sayfalama + (yalnız iptal anı) sıralama. */
export type CancellationListRequest = CancellationListQuery &
  Pick<ListQuery, "page" | "limit" | "sortOrder">;

/**
 * Admin "İptal & İade" ekranının İptaller sekmesi: liste, sayaçlar.
 *
 * Satır = sepet (CheckoutGroup, GRP) ya da grupsuz sipariş (ORD) ya da takas;
 * satır yalnız kapsamdaki İPTAL kalemlerini taşır. Kaynaklar ve sekme / alt
 * sekme tanımları `helpers/cancellation-where.ts`'te; liste, sayaçlar ve Excel
 * aynı builder'ı kullanır.
 *
 * Sıralama iptal anına göredir (varsayılan yeni → eski). Aktör/iptal damgası
 * gelmeden önceki iptallerin anı yoktur: yön ne olursa olsun sona düşerler.
 * Sepetin iptal anı kalemlerinin en geç iptalidir; bu yüzden damgalı sepetler
 * `groupBy` + `_max` ile, damgasız (eski) sepetler ayrı kaynak olarak okunur —
 * `(cancelled_by, cancelled_at)` ve `cancelled_at` indeksleri bu okumaları taşır.
 */
@Injectable()
export class AdminCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly storageService?: StorageService,
  ) {}

  async list(
    query: CancellationListRequest,
  ): Promise<PaginatedResult<AdminCancellationRow>> {
    const now = new Date();
    const { tab, bucket, filters } = cancellationScopeOf(query);
    const { order, trade } = cancellationSourceWheres(
      tab,
      bucket,
      filters,
      now,
    );
    const dir: SortDirection = query.sortOrder === "asc" ? "asc" : "desc";

    const sources = [
      ...(order ? this.orderSources(order, dir) : []),
      ...(trade ? [this.tradeSource(trade, dir)] : []),
    ];
    const page = await paginateMerged<CancellationHead>(
      sources,
      cancellationHeadComparator(dir),
      query,
    );
    return { ...page, data: await this.hydrate(page.data, order) };
  }

  /**
   * Her sekmenin her alt sekmesinin sayacı — tek istek, tek `$transaction`.
   * Sepet sayacı "kapsamda en az bir iptal kalemi olan sepet"tir; listenin
   * damgalı + damgasız sepet kaynaklarının toplamıyla birebir aynı küme.
   */
  async counts(query: CancellationListQuery): Promise<AdminCancellationCounts> {
    const now = new Date();
    const { filters } = cancellationScopeOf(query);

    const queries = new Map<string, Prisma.PrismaPromise<number>>();
    const enqueue = (
      source: string,
      where: unknown,
      run: () => Prisma.PrismaPromise<number>,
    ) => {
      const key = `${source}:${JSON.stringify(where)}`;
      if (!queries.has(key)) queries.set(key, run());
      return key;
    };

    const plan = ADMIN_CANCELLATION_TABS.flatMap((tab) =>
      ADMIN_CANCELLATION_BUCKETS.map((bucket) => {
        const { order, trade } = cancellationSourceWheres(
          tab,
          bucket,
          filters,
          now,
        );
        const keys: string[] = [];
        if (order) {
          const group = groupsWithLines(order);
          keys.push(
            enqueue("group", group, () =>
              this.prisma.checkoutGroup.count({ where: group }),
            ),
          );
          const loose = looseLines(order);
          keys.push(
            enqueue("order", loose, () =>
              this.prisma.order.count({ where: loose }),
            ),
          );
        }
        if (trade) {
          keys.push(
            enqueue("trade", trade, () =>
              this.prisma.trade.count({ where: trade }),
            ),
          );
        }
        return { tab, bucket, keys };
      }),
    );

    const keys = [...queries.keys()];
    const results = await this.prisma.$transaction([...queries.values()]);
    const countOf = new Map(keys.map((key, i) => [key, results[i] ?? 0]));

    const counts = Object.fromEntries(
      ADMIN_CANCELLATION_TABS.map((tab) => [
        tab,
        {
          total: 0,
          buckets: Object.fromEntries(
            ADMIN_CANCELLATION_BUCKETS.map((bucket) => [bucket, 0]),
          ),
        },
      ]),
    ) as AdminCancellationCounts;
    for (const { tab, bucket, keys: parts } of plan) {
      const n = parts.reduce((sum, key) => sum + (countOf.get(key) ?? 0), 0);
      counts[tab].buckets[bucket] = n;
      if (bucket === "all") counts[tab].total = n;
    }
    return counts;
  }

  /**
   * Geçerli filtrenin Excel dosyası — listeyle AYNI kaynak ve sıralama: liste
   * sayfaları en büyük sayfa boyuyla sırayla okunur (tavana kadar).
   */
  async exportXlsx(
    query: CancellationListRequest,
    locale: Locale,
  ): Promise<{ filename: string; body: Buffer; truncated: boolean }> {
    const rows: AdminCancellationRow[] = [];
    let truncated = false;
    for (let page = 1; ; page++) {
      const result = await this.list({
        ...query,
        page,
        limit: ADMIN_LIST_MAX_LIMIT,
      });
      rows.push(...result.data);
      if (rows.length >= CANCELLATION_EXPORT_ROW_CAP) {
        truncated =
          rows.length > CANCELLATION_EXPORT_ROW_CAP ||
          page < result.meta.totalPages;
        rows.length = Math.min(rows.length, CANCELLATION_EXPORT_ROW_CAP);
        break;
      }
      if (page >= result.meta.totalPages) break;
    }
    const sheet = cancellationExportSheet(rows, (key) =>
      translateMessage(key, locale),
    );
    const day = new Date().toISOString().slice(0, 10);
    return {
      filename: `iptaller-${day}.xlsx`,
      body: await toXlsx([sheet]),
      truncated,
    };
  }

  // ── Kaynaklar ──────────────────────────────────────────────────────────────

  private orderSources(lineWhere: Prisma.OrderWhereInput, dir: SortDirection) {
    const stamped = stampedLines(lineWhere);
    const unstamped = unstampedLines(lineWhere);

    // Damgalı sepetler: sepetin iptal anı = kapsamdaki kalemlerin en geçi.
    const stampedGroups = {
      count: () =>
        this.prisma.checkoutGroup.count({ where: groupsWithLines(stamped) }),
      head: async (take: number): Promise<CancellationHead[]> => {
        const rows = await this.prisma.order.groupBy({
          by: ["checkoutGroupId"],
          where: { AND: [stamped, { checkoutGroupId: { not: null } }] },
          _max: { cancelledAt: true },
          orderBy: [{ _max: { cancelledAt: dir } }, { checkoutGroupId: "asc" }],
          take,
        });
        return rows.flatMap((row) =>
          row.checkoutGroupId
            ? [
                {
                  kind: "group" as const,
                  id: row.checkoutGroupId,
                  cancelledAt: row._max.cancelledAt ?? null,
                },
              ]
            : [],
        );
      },
    };

    // Damgasız (eski) sepetler: hiçbir kapsam kalemi damgalı değil → sona.
    const legacyGroupWhere: Prisma.CheckoutGroupWhereInput = {
      AND: [groupsWithLines(unstamped), { orders: { none: stamped } }],
    };
    const legacyGroups = {
      count: () => this.prisma.checkoutGroup.count({ where: legacyGroupWhere }),
      head: async (take: number): Promise<CancellationHead[]> =>
        (
          await this.prisma.checkoutGroup.findMany({
            where: legacyGroupWhere,
            select: { id: true },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take,
          })
        ).map((group) => ({
          kind: "group" as const,
          id: group.id,
          cancelledAt: null,
        })),
    };

    const loose = looseLines(lineWhere);
    const looseOrders = {
      count: () => this.prisma.order.count({ where: loose }),
      head: async (take: number): Promise<CancellationHead[]> =>
        (
          await this.prisma.order.findMany({
            where: loose,
            select: { id: true, cancelledAt: true },
            orderBy: [
              { cancelledAt: { sort: dir, nulls: "last" } },
              { createdAt: "desc" },
              { id: "asc" },
            ],
            take,
          })
        ).map((order) => ({
          kind: "order" as const,
          id: order.id,
          cancelledAt: order.cancelledAt,
        })),
    };

    return [stampedGroups, looseOrders, legacyGroups];
  }

  private tradeSource(where: Prisma.TradeWhereInput, dir: SortDirection) {
    return {
      count: () => this.prisma.trade.count({ where }),
      head: async (take: number): Promise<CancellationHead[]> =>
        (
          await this.prisma.trade.findMany({
            where,
            select: { id: true, cancelledAt: true },
            orderBy: [
              { cancelledAt: { sort: dir, nulls: "last" } },
              { createdAt: "desc" },
              { id: "asc" },
            ],
            take,
          })
        ).map((trade) => ({
          kind: "trade" as const,
          id: trade.id,
          cancelledAt: trade.cancelledAt,
        })),
    };
  }

  // ── Satırların doldurulması ────────────────────────────────────────────────

  private async hydrate(
    heads: readonly CancellationHead[],
    lineWhere: Prisma.OrderWhereInput | undefined,
  ): Promise<AdminCancellationRow[]> {
    if (heads.length === 0) return [];
    const idsOf = (kind: CancellationHead["kind"]) =>
      heads.filter((head) => head.kind === kind).map((head) => head.id);
    const groupIds = idsOf("group");
    const orderIds = idsOf("order");
    const tradeIds = idsOf("trade");

    const [lines, groups, groupSizes, trades] = await Promise.all([
      lineWhere && (groupIds.length || orderIds.length)
        ? this.prisma.order.findMany({
            where: {
              OR: [
                ...(groupIds.length
                  ? [
                      {
                        AND: [{ checkoutGroupId: { in: groupIds } }, lineWhere],
                      },
                    ]
                  : []),
                ...(orderIds.length ? [{ id: { in: orderIds } }] : []),
              ],
            },
            select: CANCELLATION_LINE_SELECT,
            orderBy: [{ createdAt: "asc" }, { orderNumber: "asc" }],
          })
        : Promise.resolve([] as CancellationLine[]),
      groupIds.length
        ? this.prisma.checkoutGroup.findMany({
            where: { id: { in: groupIds } },
            select: { id: true, groupNumber: true, createdAt: true },
          })
        : Promise.resolve([]),
      groupIds.length
        ? this.prisma.order.groupBy({
            by: ["checkoutGroupId"],
            where: { checkoutGroupId: { in: groupIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      tradeIds.length
        ? this.prisma.trade.findMany({
            where: { id: { in: tradeIds } },
            select: CANCELLATION_TRADE_SELECT,
          })
        : Promise.resolve([]),
    ]);

    const ctx = this.rowContext();
    const linesByCart = new Map<string, CancellationLine[]>();
    for (const line of lines) {
      const key = line.checkoutGroupId ?? line.id;
      linesByCart.set(key, [...(linesByCart.get(key) ?? []), line]);
    }
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const sizeByGroup = new Map(
      groupSizes.map((row) => [row.checkoutGroupId, row._count._all]),
    );
    const tradeById = new Map(trades.map((trade) => [trade.id, trade]));

    return heads.flatMap((head): AdminCancellationRow[] => {
      if (head.kind === "trade") {
        const trade = tradeById.get(head.id);
        return trade ? [mapCancelledTradeRow(trade, ctx)] : [];
      }
      const members = linesByCart.get(head.id);
      if (!members?.length) return [];
      if (head.kind === "group") {
        const group = groupById.get(head.id);
        if (!group) return [];
        return [
          mapCancelledCartRow(
            {
              kind: "group",
              id: group.id,
              number: group.groupNumber,
              createdAt: group.createdAt,
            },
            members,
            sizeByGroup.get(group.id) ?? members.length,
            ctx,
          ),
        ];
      }
      const order = members[0];
      return [
        mapCancelledCartRow(
          {
            kind: "order",
            id: order.id,
            number: order.orderNumber,
            createdAt: order.createdAt,
          },
          members,
          1,
          ctx,
        ),
      ];
    });
  }

  /** İptal satırı fatura göstermez; yalnız görsel çözümü gerekir. */
  private rowContext(): RowMapContext {
    return {
      now: new Date(),
      invoicesBySource: new Map(),
      imageUrl: (key) =>
        resolveProductImageUrl(key, (k) =>
          this.storageService?.getPublicAssetUrl(k),
        ),
    };
  }
}

// ── Kaynak `where`'leri (liste ve sayaçlar paylaşır) ──────────────────────────

/** Kapsamda en az bir iptal kalemi olan sepetler. */
export function groupsWithLines(
  lineWhere: Prisma.OrderWhereInput,
): Prisma.CheckoutGroupWhereInput {
  return { orders: { some: lineWhere } };
}

/** Grupsuz (teklif ya da eski tekil) iptal siparişleri. */
export function looseLines(
  lineWhere: Prisma.OrderWhereInput,
): Prisma.OrderWhereInput {
  return { AND: [lineWhere, { checkoutGroupId: null }] };
}

function stampedLines(
  lineWhere: Prisma.OrderWhereInput,
): Prisma.OrderWhereInput {
  return { AND: [lineWhere, { cancelledAt: { not: null } }] };
}

function unstampedLines(
  lineWhere: Prisma.OrderWhereInput,
): Prisma.OrderWhereInput {
  return { AND: [lineWhere, { cancelledAt: null }] };
}
