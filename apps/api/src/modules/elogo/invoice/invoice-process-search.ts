import type { Prisma, PrismaClient } from "@prisma/client";
import { REFERENCE_PREFIX } from "../../../common/helpers/code-prefixes";
import {
  type InvoiceSourceKind,
  invoiceTypesOfSourceKind,
} from "./invoice-source";

/**
 * "İşlem No" araması — ORD-/BST-/MEM-/TKS-/RFD- numarasını faturanın tipsiz
 * `sourceId` anahtarına çevirir.
 *
 * Numara TAM eşleşir: referanslar rastgele ve tekildir, parça aramak anlamlı
 * bir daraltma sağlamaz ama tam tablo taraması yapar. Bulunamayan numara BOŞ
 * sonuç üretir — filtreyi sessizce düşürmek, aranan işlemin faturaları sanılan
 * dolu bir liste gösterirdi.
 */

type PrismaLike = Pick<
  PrismaClient,
  | "order"
  | "trade"
  | "refundRequest"
  | "productBoost"
  | "membershipPayment"
  | "elogoInvoice"
>;

/** Hiçbir belgeyle eşleşmeyen koşul. */
export const NO_INVOICE_MATCH: Prisma.ElogoInvoiceWhereInput = {
  id: { in: [] },
};

/** Sipariş numarası taşıyan önekler: satış, öne çıkarma, üyelik siparişi. */
const ORDER_PREFIXES: readonly string[] = [
  REFERENCE_PREFIX.order,
  REFERENCE_PREFIX.boostOrder,
  REFERENCE_PREFIX.membershipOrder,
];

type SourceIds = Partial<
  Record<Exclude<InvoiceSourceKind, "reversed_invoice">, string[]>
>;

/**
 * Metin bir işlem numarası değilse `null` — çağıran onu genel aramaya
 * eklemez. Numara ise eşleşen belgelerin koşulu (yoksa `NO_INVOICE_MATCH`).
 */
export async function invoiceProcessWhere(
  prisma: PrismaLike,
  raw: string,
): Promise<Prisma.ElogoInvoiceWhereInput | null> {
  const code = raw.trim().toUpperCase();
  const prefix = code.split("-")[0];
  let sources: SourceIds;
  if (ORDER_PREFIXES.includes(prefix))
    sources = await orderSources(prisma, code);
  else if (prefix === REFERENCE_PREFIX.trade)
    sources = await tradeSources(prisma, code);
  else if (prefix === REFERENCE_PREFIX.refundRequest)
    sources = await refundRequestSources(prisma, code);
  else return null;

  const direct = sourceConditions(sources);
  if (direct.length === 0) return NO_INVOICE_MATCH;
  return { OR: [...direct, ...(await reversalsOf(prisma, direct))] };
}

/**
 * Bir sipariş numarası; koli ücret belgelerinde (koli id'si), eski / platform
 * satışı ve üyelik belgelerinde (sipariş id'si), üyelik ödemesi, boost ve iade
 * talebi anahtarlı belgelerde görünür — hepsi aynı numarayla bulunur.
 */
async function orderSources(
  prisma: PrismaLike,
  orderNumber: string,
): Promise<SourceIds> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, packageId: true },
  });
  if (!order) return {};
  const byOrder = { where: { orderId: order.id }, select: { id: true } };
  const [membershipPayments, boosts, refundRequests] = await Promise.all([
    prisma.membershipPayment.findMany(byOrder),
    prisma.productBoost.findMany(byOrder),
    prisma.refundRequest.findMany(byOrder),
  ]);
  return {
    package_or_order: order.packageId
      ? [order.id, order.packageId]
      : [order.id],
    membership: [order.id, ...ids(membershipPayments)],
    boost: ids(boosts),
    refund_request: ids(refundRequests),
  };
}

async function tradeSources(
  prisma: PrismaLike,
  tradeNumber: string,
): Promise<SourceIds> {
  const trade = await prisma.trade.findUnique({
    where: { tradeNumber },
    select: { cashPayments: { select: { id: true } } },
  });
  return trade ? { trade_payment: ids(trade.cashPayments) } : {};
}

async function refundRequestSources(
  prisma: PrismaLike,
  refundNumber: string,
): Promise<SourceIds> {
  const request = await prisma.refundRequest.findUnique({
    where: { refundNumber },
    select: { id: true },
  });
  return request ? { refund_request: [request.id] } : {};
}

function sourceConditions(sources: SourceIds): Prisma.ElogoInvoiceWhereInput[] {
  return (Object.entries(sources) as [keyof SourceIds, string[]][])
    .filter(([, sourceIds]) => sourceIds.length > 0)
    .map(([kind, sourceIds]) => ({
      type: { in: invoiceTypesOfSourceKind(kind) },
      sourceId: { in: sourceIds },
    }));
}

/**
 * İade faturası asıl belgeyi `<faturaId>` ya da kısmi iadede
 * `<faturaId>:<refundAttemptId>` ile gösterir; işlemin faturalarını ters
 * çeviren belgeler de o işleme aittir (bir seviye).
 */
async function reversalsOf(
  prisma: PrismaLike,
  direct: Prisma.ElogoInvoiceWhereInput[],
): Promise<Prisma.ElogoInvoiceWhereInput[]> {
  const originals = ids(
    await prisma.elogoInvoice.findMany({
      where: { OR: direct },
      select: { id: true },
    }),
  );
  if (originals.length === 0) return [];
  return [
    {
      type: "return_invoice",
      OR: [
        { sourceId: { in: originals } },
        ...originals.map((id) => ({ sourceId: { startsWith: `${id}:` } })),
      ],
    },
  ];
}

const ids = (rows: { id: string }[]): string[] => rows.map((row) => row.id);
