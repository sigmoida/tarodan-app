import type {
  ElogoInvoiceContext,
  ElogoInvoiceType,
  OrderOrigin,
  PrismaClient,
} from "@prisma/client";

/**
 * Faturanın dayandığı İŞLEMİN tarafları ve gerçekleşme şekli.
 *
 * Belgenin muhatabı (`recipientUserId`) bunlardan biridir; bu üçlü ise işlemin
 * KENDİSİNİ tarif eder ve admin fatura listesinin "Satıcı", "Alıcı" ve "Sipariş
 * Gerçekleşme Şekli" kolonlarını besler. Kesim anında snapshot'lanır: sayfalama
 * ve sıralama sunucuda yapıldığı için sonradan çözülen bir değerle filtre
 * kurulamaz.
 */
export interface InvoiceParties {
  sellerUserId: string | null;
  buyerUserId: string | null;
  context: ElogoInvoiceContext | null;
}

/** Kaynağı çözülemeyen belge — kolonlar boş kalır, kesim yine de sürer. */
export const EMPTY_INVOICE_PARTIES: InvoiceParties = {
  sellerUserId: null,
  buyerUserId: null,
  context: null,
};

/**
 * Siparişin kaynağı → faturanın gerçekleşme şekli. İki enum aynı değerleri
 * taşır ama AYNI enum değildir (takasın siparişi yoktur, `trade` yalnız fatura
 * tarafında bulunur); eşleme kapalı yazılır ki `OrderOrigin`'e eklenen yeni bir
 * değer derlemede yakalansın.
 */
const CONTEXT_BY_ORIGIN: Record<OrderOrigin, ElogoInvoiceContext> = {
  direct_sale: "direct_sale",
  offer: "offer",
  platform_service: "platform_service",
};

export function contextFromOrigin(
  origin: OrderOrigin | null | undefined,
): ElogoInvoiceContext | null {
  return origin ? CONTEXT_BY_ORIGIN[origin] : null;
}

/**
 * Nest DI'ına bağlı olmayan yüzey: `PrismaService` de düz `PrismaClient` de
 * geçer. Geçmiş kayıtları dolduran script (`maintenance/backfill-elogo-
 * invoice-parties.ts`) kesimle AYNI kodu koşsun diye böyle — eşlemenin ikinci bir
 * nüshası olsaydı backfill ile kesim ilk şema değişikliğinde ayrışırdı.
 */
type PrismaLike = Pick<
  PrismaClient,
  | "elogoInvoice"
  | "tradeCashPayment"
  | "refundRequest"
  | "productBoost"
  | "membershipPayment"
  | "orderPackage"
  | "order"
>;

/**
 * Belgenin dayandığı işlemin tarafları ve gerçekleşme şekli.
 *
 * `sourceId` tipsiz bir anahtardır ve faturanın TÜRÜNE göre başka tabloyu
 * gösterir (koli / sipariş / takas ödemesi / boost / üyelik ödemesi / iade
 * talebi / başka bir fatura). O eşlemenin tek yeri burasıdır.
 *
 * Çözülemeyen kaynak sessizce boş döner: fatura kesmek para hareketini
 * bloklamaz, admin kolonunun boş kalması kesimin durmasından iyidir.
 */
export async function resolveInvoiceParties(
  prisma: PrismaLike,
  type: ElogoInvoiceType,
  sourceId: string,
): Promise<InvoiceParties> {
  try {
    switch (type) {
      case "return_invoice":
        return await partiesOfReversedInvoice(prisma, sourceId);
      case "trade_commission":
      case "trade_service_fee":
      case "trade_shipping":
        return await partiesOfTradePayment(prisma, sourceId);
      case "penalty":
        return await partiesOfRefundRequest(prisma, sourceId);
      case "boost":
        return await partiesOfBoost(prisma, sourceId);
      case "membership":
        return await partiesOfMembership(prisma, sourceId);
      default:
        return await partiesOfPackageOrOrder(prisma, sourceId);
    }
  } catch {
    return EMPTY_INVOICE_PARTIES;
  }
}

/**
 * İade faturası taraflarını ters çevirdiği belgeden devralır. Kısmi iadede
 * kaynak `<faturaId>:<refundAttemptId>` biçimindedir.
 */
async function partiesOfReversedInvoice(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const original = await prisma.elogoInvoice.findUnique({
    where: { id: sourceId.split(":")[0] },
    select: { sellerUserId: true, buyerUserId: true, context: true },
  });
  return original ?? EMPTY_INVOICE_PARTIES;
}

/**
 * Takasta "satıcı/alıcı" yoktur; belge bedeli ÖDEYEN tarafa kesilir, o yüzden
 * ödeyen alıcı, karşı taraf satıcı sütununa yazılır.
 */
async function partiesOfTradePayment(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const payment = await prisma.tradeCashPayment.findUnique({
    where: { id: sourceId },
    select: {
      payerId: true,
      trade: { select: { initiatorId: true, receiverId: true } },
    },
  });
  if (!payment) return EMPTY_INVOICE_PARTIES;
  const { initiatorId, receiverId } = payment.trade;
  return {
    buyerUserId: payment.payerId,
    sellerUserId: initiatorId === payment.payerId ? receiverId : initiatorId,
    context: "trade",
  };
}

/** Ceza faturasının kaynağı iade TALEBİdir; taraflar talebin siparişinden gelir. */
async function partiesOfRefundRequest(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const request = await prisma.refundRequest.findUnique({
    where: { id: sourceId },
    select: {
      order: { select: { sellerId: true, buyerId: true, origin: true } },
    },
  });
  return request?.order
    ? {
        sellerUserId: request.order.sellerId,
        buyerUserId: request.order.buyerId,
        context: contextFromOrigin(request.order.origin),
      }
    : EMPTY_INVOICE_PARTIES;
}

/** Öne çıkarma: satıcı platform kullanıcısıdır, alıcı boost'u satın alandır. */
async function partiesOfBoost(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const boost = await prisma.productBoost.findUnique({
    where: { id: sourceId },
    select: { userId: true, orderId: true },
  });
  if (!boost) return EMPTY_INVOICE_PARTIES;
  // `ProductBoost.orderId` bir ilişki değil, düz kolon — sipariş ayrı okunur.
  const order = boost.orderId
    ? await prisma.order.findUnique({
        where: { id: boost.orderId },
        select: { sellerId: true },
      })
    : null;
  return {
    sellerUserId: order?.sellerId ?? null,
    buyerUserId: boost.userId,
    context: "platform_service",
  };
}

/**
 * Üyelik belgesi sipariş ya da üyelik ÖDEMESİ anahtarlı olabilir; iki nesil de
 * buradan çözülür.
 */
async function partiesOfMembership(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const parties = await partiesOfPackageOrOrder(prisma, sourceId);
  if (parties.buyerUserId) return parties;
  const payment = await prisma.membershipPayment.findUnique({
    where: { id: sourceId },
    select: {
      order: { select: { sellerId: true, buyerId: true, origin: true } },
    },
  });
  return payment?.order
    ? {
        sellerUserId: payment.order.sellerId,
        buyerUserId: payment.order.buyerId,
        context: contextFromOrigin(payment.order.origin),
      }
    : EMPTY_INVOICE_PARTIES;
}

/**
 * Ücret belgeleri KOLİ anahtarlıdır; koli anahtarına geçilmeden önce kesilmiş
 * eski belgeler ve platform satışı ise SİPARİŞ anahtarlıdır. Gerçekleşme şekli
 * kolinin ilk siparişinden okunur — bir koli tek bir alışverişten doğar.
 */
async function partiesOfPackageOrOrder(
  prisma: PrismaLike,
  sourceId: string,
): Promise<InvoiceParties> {
  const pkg = await prisma.orderPackage.findUnique({
    where: { id: sourceId },
    select: {
      sellerId: true,
      buyerId: true,
      orders: {
        select: { origin: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });
  if (pkg) {
    return {
      sellerUserId: pkg.sellerId,
      buyerUserId: pkg.buyerId,
      context: contextFromOrigin(pkg.orders[0]?.origin) ?? "direct_sale",
    };
  }
  const order = await prisma.order.findUnique({
    where: { id: sourceId },
    select: { sellerId: true, buyerId: true, origin: true },
  });
  return order
    ? {
        sellerUserId: order.sellerId,
        buyerUserId: order.buyerId,
        context: contextFromOrigin(order.origin),
      }
    : EMPTY_INVOICE_PARTIES;
}
