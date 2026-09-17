import type { ElogoInvoiceType, Prisma, PrismaClient } from "@prisma/client";
import type { InvoiceProcess, InvoiceProcessRef } from "@tarodan/types";
import {
  type InvoiceSourceKind,
  invoiceSourceKindOf,
  reversedInvoiceIdOf,
} from "./invoice-source";

/**
 * Admin fatura listesinin "Gerçekleşme Şekli" hücresindeki İŞLEM referansları:
 * belgenin dayandığı işlemin insan-okur numaraları (ORD-/TKS-/RFD-/BST-/MEM-)
 * ve her birinin bağlandığı kaydın id'si.
 *
 * Şema değişikliği yok: `sourceId` tipsiz kalır, çözüm SAYFA BAŞINA topludur.
 * Satırlar kaynak ailesine göre gruplanır ve her kaynak tablosuna tek bir
 * `findMany({ id: { in } })` atılır — satır sayısı sorgu sayısını büyütmez.
 * Aşamalar: (0) iade faturalarının asıl belgeleri, (1) kaynak tabloları,
 * (2) siparişler (eski sipariş anahtarları + boost/üyelik siparişleri).
 */

type PrismaLike = Pick<
  PrismaClient,
  | "elogoInvoice"
  | "orderPackage"
  | "order"
  | "tradeCashPayment"
  | "refundRequest"
  | "productBoost"
  | "membershipPayment"
>;

export interface InvoiceProcessSource {
  id: string;
  type: ElogoInvoiceType;
  sourceId: string;
}

const orderRefSelect = {
  id: true,
  orderNumber: true,
  origin: true,
  offerId: true,
  buyerId: true,
} satisfies Prisma.OrderSelect;

type OrderRefRow = Prisma.OrderGetPayload<{ select: typeof orderRefSelect }>;

/** Kaynak anahtarı (tür ailesi + id); iade faturasında asıl belgeninki. */
interface SourceKey {
  kind: Exclude<InvoiceSourceKind, "reversed_invoice">;
  sourceId: string;
}

export async function resolveInvoiceProcesses(
  prisma: PrismaLike,
  invoices: InvoiceProcessSource[],
): Promise<Map<string, InvoiceProcess | null>> {
  const keys = await sourceKeysOf(prisma, invoices);
  const loaded = await loadSources(prisma, [...keys.values()]);
  return new Map(
    invoices.map((invoice) => {
      const key = keys.get(invoice.id);
      return [invoice.id, key ? processOf(toRefs(key, loaded)) : null];
    }),
  );
}

/**
 * Aşama 0: her faturanın kaynak anahtarı. İade faturası ters çevirdiği
 * belgenin anahtarını devralır — yalnız BİR seviye; asıl belge de iade
 * faturasıysa çözülmez (döngüye karşı).
 */
async function sourceKeysOf(
  prisma: PrismaLike,
  invoices: InvoiceProcessSource[],
): Promise<Map<string, SourceKey>> {
  const originalIds = unique(
    invoices
      .filter((invoice) => isReversed(invoice.type))
      .map((invoice) => reversedInvoiceIdOf(invoice.sourceId)),
  );
  const originals = new Map(
    originalIds.length > 0
      ? (
          await prisma.elogoInvoice.findMany({
            where: { id: { in: originalIds } },
            select: { id: true, type: true, sourceId: true },
          })
        ).map((original) => [original.id, original])
      : [],
  );

  const keys = new Map<string, SourceKey>();
  for (const invoice of invoices) {
    const source = isReversed(invoice.type)
      ? originals.get(reversedInvoiceIdOf(invoice.sourceId))
      : invoice;
    if (!source) continue;
    const kind = invoiceSourceKindOf(source.type);
    if (kind === "reversed_invoice") continue;
    keys.set(invoice.id, { kind, sourceId: source.sourceId });
  }
  return keys;
}

const isReversed = (type: ElogoInvoiceType) =>
  invoiceSourceKindOf(type) === "reversed_invoice";

type LoadedSources = Awaited<ReturnType<typeof loadSources>>;

/** Aşama 1 + 2: kaynak tablosu başına en fazla bir sorgu. */
async function loadSources(prisma: PrismaLike, keys: SourceKey[]) {
  const idsOf = (kind: SourceKey["kind"]) =>
    unique(keys.filter((key) => key.kind === kind).map((key) => key.sourceId));
  const packageOrOrderIds = idsOf("package_or_order");
  const membershipIds = idsOf("membership");

  const [packages, tradePayments, refundRequests, boosts, membershipPayments] =
    await Promise.all([
      findByIds(packageOrOrderIds, (ids) =>
        prisma.orderPackage.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            orders: { select: orderRefSelect, orderBy: { createdAt: "asc" } },
          },
        }),
      ),
      findByIds(idsOf("trade_payment"), (ids) =>
        prisma.tradeCashPayment.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            tradeId: true,
            trade: { select: { tradeNumber: true } },
          },
        }),
      ),
      findByIds(idsOf("refund_request"), (ids) =>
        prisma.refundRequest.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            refundNumber: true,
            order: { select: orderRefSelect },
          },
        }),
      ),
      findByIds(idsOf("boost"), (ids) =>
        prisma.productBoost.findMany({
          where: { id: { in: ids } },
          select: { id: true, orderId: true },
        }),
      ),
      findByIds(membershipIds, (ids) =>
        prisma.membershipPayment.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            orderId: true,
            membership: { select: { userId: true } },
          },
        }),
      ),
    ]);

  // Koli olarak bulunamayan anahtar eski (sipariş anahtarlı) belgedir; boost ve
  // üyelik ödemesinin siparişleri düz kolondan gelir — hepsi TEK sorguda.
  const orderIds = unique([
    ...packageOrOrderIds.filter((id) => !packages.has(id)),
    ...membershipIds,
    ...[...boosts.values(), ...membershipPayments.values()].flatMap((row) =>
      row.orderId ? [row.orderId] : [],
    ),
  ]);
  const orders = await findByIds(orderIds, (ids) =>
    prisma.order.findMany({
      where: { id: { in: ids } },
      select: orderRefSelect,
    }),
  );

  return {
    packages,
    orders,
    tradePayments,
    refundRequests,
    boosts,
    membershipPayments,
  };
}

async function findByIds<Row extends { id: string }>(
  ids: string[],
  query: (ids: string[]) => Promise<Row[]>,
): Promise<Map<string, Row>> {
  if (ids.length === 0) return new Map();
  return new Map((await query(ids)).map((row) => [row.id, row]));
}

/** Aşama 3: yüklenmiş kayıtlardan referanslar — saf eşleme, sorgu yok. */
function toRefs(key: SourceKey, loaded: LoadedSources): InvoiceProcessRef[] {
  const { sourceId } = key;
  switch (key.kind) {
    case "package_or_order": {
      const pkg = loaded.packages.get(sourceId);
      if (pkg) return pkg.orders.map(orderRef);
      const order = loaded.orders.get(sourceId);
      return order ? [orderRef(order)] : [];
    }
    case "trade_payment": {
      const payment = loaded.tradePayments.get(sourceId);
      return payment
        ? [
            {
              kind: "trade",
              label: payment.trade.tradeNumber,
              targetId: payment.tradeId,
            },
          ]
        : [];
    }
    case "refund_request": {
      const request = loaded.refundRequests.get(sourceId);
      if (!request) return [];
      return [
        {
          kind: "refund_request",
          label: request.refundNumber,
          targetId: request.id,
        },
        ...(request.order ? [orderRef(request.order)] : []),
      ];
    }
    case "boost": {
      const boost = loaded.boosts.get(sourceId);
      if (!boost) return [];
      const order = boost.orderId ? loaded.orders.get(boost.orderId) : null;
      return [
        {
          kind: "boost",
          label: order?.orderNumber ?? null,
          targetId: boost.id,
        },
      ];
    }
    case "membership":
      return membershipRefs(sourceId, loaded);
  }
}

/**
 * Üyelik belgesi sipariş (MEM-) ya da üyelik ÖDEMESİ anahtarlıdır. Bağlantı her
 * iki nesilde de ÜYENİN sayfasına gider; numara çözülebiliyorsa gösterilir.
 */
function membershipRefs(
  sourceId: string,
  loaded: LoadedSources,
): InvoiceProcessRef[] {
  const order = loaded.orders.get(sourceId);
  if (order)
    return [
      { kind: "membership", label: order.orderNumber, targetId: order.buyerId },
    ];
  const payment = loaded.membershipPayments.get(sourceId);
  if (!payment) return [];
  const paymentOrder = payment.orderId
    ? loaded.orders.get(payment.orderId)
    : null;
  return [
    {
      kind: "membership",
      label: paymentOrder?.orderNumber ?? null,
      targetId: payment.membership.userId,
    },
  ];
}

/**
 * Siparişin referansı. Teklif kaynaklı siparişte numara yine ORD'dur ama
 * bağlantı TEKLİFİN detayına gider; teklif ilişkisi kopmuşsa siparişe düşer.
 */
function orderRef(order: OrderRefRow): InvoiceProcessRef {
  return order.origin === "offer" && order.offerId
    ? { kind: "offer", label: order.orderNumber, targetId: order.offerId }
    : { kind: "order", label: order.orderNumber, targetId: order.id };
}

function processOf(refs: InvoiceProcessRef[]): InvoiceProcess | null {
  return refs.length > 0 ? { kind: refs[0].kind, refs } : null;
}

const unique = (values: string[]): string[] => [...new Set(values)];
