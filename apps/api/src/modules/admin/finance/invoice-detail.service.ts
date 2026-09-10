import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ElogoInvoiceContext,
  ElogoInvoiceType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { invoiceDescriptionOf } from "../../elogo/invoice/invoice-line-description";
import { readInvoiceLineItems } from "../../elogo/invoice/invoice-lines";

/** Belgenin üzerindeki tek kalem (çok kalemli belgede birden fazla). */
export interface InvoiceDetailLine {
  name: string;
  quantity: number;
  unitPrice: number;
  net: number;
  vatRate: number;
  taxAmount: number;
  total: number;
}

/**
 * Faturanın DAYANDIĞI işlemin tek satırı. Sipariş, takas, öne çıkarma ve ceza
 * aynı dört sütuna sığsın diye alanlar bilinçli olarak geneldir — mali müşavir
 * belgeyi işleme bununla bağlar, farklı türler için farklı tablo okumaz.
 */
export interface InvoiceSourceRow {
  reference: string;
  description: string;
  quantity: number | null;
  amount: number | null;
  occurredAt: Date | null;
}

export interface InvoiceDetailData {
  invoiceNumber: string;
  type: ElogoInvoiceType;
  description: string;
  documentType: string;
  status: string;
  context: ElogoInvoiceContext | null;
  ettn: string | null;
  sourceReference: string | null;
  billingReference: string | null;
  issuedAt: Date | null;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  sellerName: string | null;
  sellerCode: string | null;
  buyerName: string | null;
  buyerCode: string | null;
  recipientName: string | null;
  recipientVknTckn: string | null;
  recipientEmail: string | null;
  netAmount: number;
  discountTotal: number;
  taxAmount: number;
  vatRate: number;
  total: number;
  lines: InvoiceDetailLine[];
  source: InvoiceSourceRow[];
}

const partySelect = {
  adminCode: true,
  displayName: true,
  companyName: true,
} satisfies Prisma.UserSelect;

const partyName = (
  user: { displayName: string; companyName: string | null } | null,
): string | null => (user ? user.companyName || user.displayName : null);

/**
 * Tek bir faturanın DETAY DÖKÜMÜ — belgenin kalem kırılımı + dayandığı işlem.
 *
 * Fatura ekranındaki "Detay Dökümü" indirmesini besler. Hizmet faturaları tek
 * kalemlidir ve `lineItems` kolonları boştur; o belgelerde asıl bilgi kaynak
 * işlemin kırılımıdır (hangi koli, hangi ürünler, hangi takas) — bu yüzden iki
 * tablo birlikte üretilir.
 */
@Injectable()
export class InvoiceDetailService {
  constructor(private readonly prisma: PrismaService) {}

  async build(invoiceId: string): Promise<InvoiceDetailData> {
    const invoice = await this.prisma.elogoInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        type: true,
        sourceId: true,
        sourceReference: true,
        lineDescription: true,
        lineItems: true,
        documentType: true,
        status: true,
        context: true,
        ettn: true,
        invoiceNumber: true,
        billingReference: true,
        issuedAt: true,
        createdAt: true,
        cancelledAt: true,
        cancelReason: true,
        recipientName: true,
        recipientVknTckn: true,
        recipientEmail: true,
        netAmount: true,
        discountTotal: true,
        taxAmount: true,
        vatRate: true,
        total: true,
        seller: { select: partySelect },
        buyer: { select: partySelect },
      },
    });
    if (!invoice)
      throw new NotFoundException(
        i18nMessage("server.elogo.archiveInvoiceNotFound"),
      );

    const description = invoiceDescriptionOf(
      invoice.type,
      invoice.lineDescription,
    );
    return {
      invoiceNumber: invoice.invoiceNumber ?? "",
      type: invoice.type,
      description,
      documentType: invoice.documentType,
      status: invoice.status,
      context: invoice.context,
      ettn: invoice.ettn,
      sourceReference: invoice.sourceReference,
      billingReference: invoice.billingReference,
      issuedAt: invoice.issuedAt,
      createdAt: invoice.createdAt,
      cancelledAt: invoice.cancelledAt,
      cancelReason: invoice.cancelReason,
      sellerName: partyName(invoice.seller),
      sellerCode: invoice.seller?.adminCode ?? null,
      buyerName: partyName(invoice.buyer),
      buyerCode: invoice.buyer?.adminCode ?? null,
      recipientName: invoice.recipientName,
      recipientVknTckn: invoice.recipientVknTckn,
      recipientEmail: invoice.recipientEmail,
      netAmount: Number(invoice.netAmount),
      discountTotal: Number(invoice.discountTotal),
      taxAmount: Number(invoice.taxAmount),
      vatRate: Number(invoice.vatRate),
      total: Number(invoice.total),
      lines: this.buildLines(invoice.lineItems, {
        description,
        net: Number(invoice.netAmount),
        tax: Number(invoice.taxAmount),
        vatRate: Number(invoice.vatRate),
        total: Number(invoice.total),
      }),
      source: await this.buildSource(invoice.type, invoice.sourceId),
    };
  }

  /**
   * Kalem tablosu. `lineItems` yalnız ÇOK KALEMLİ belgede (platform ürün
   * satışı) doludur; hizmet faturası tek kalemdir ve kolonlardan üretilir —
   * boş bir tablo göstermek, belgenin tek kalemi olduğunu göstermekten kötüdür.
   */
  private buildLines(
    raw: unknown,
    single: {
      description: string;
      net: number;
      tax: number;
      vatRate: number;
      total: number;
    },
  ): InvoiceDetailLine[] {
    const items = readInvoiceLineItems(raw);
    if (items.length === 0)
      return [
        {
          name: single.description,
          quantity: 1,
          unitPrice: single.net,
          net: single.net,
          vatRate: single.vatRate,
          taxAmount: single.tax,
          total: single.total,
        },
      ];
    return items.map((item) => {
      const quantity = Number(item.quantity) || 1;
      const net = Number(item.net) || 0;
      const vatRate = Number(item.vatRate) || 0;
      const taxAmount =
        typeof item.taxAmount === "number"
          ? item.taxAmount
          : round2((net * vatRate) / 100);
      return {
        name: item.name,
        quantity,
        unitPrice: Number(item.unitPrice) || (quantity ? net / quantity : net),
        net,
        vatRate,
        taxAmount,
        total: round2(net + taxAmount),
      };
    });
  }

  /**
   * Kaynak işlemin kırılımı. `sourceId` faturanın TÜRÜNE göre başka tabloyu
   * gösterir; hangi türün nereye baktığı `invoice-parties.ts` ile aynı
   * eşlemedir — orası "kim", burası "ne" sorusunu cevaplar.
   */
  private async buildSource(
    type: ElogoInvoiceType,
    sourceId: string,
  ): Promise<InvoiceSourceRow[]> {
    switch (type) {
      case "return_invoice":
        return this.sourceOfReversedInvoice(sourceId);
      case "trade_commission":
      case "trade_service_fee":
      case "trade_shipping":
        return this.sourceOfTrade(sourceId);
      case "penalty":
        return this.sourceOfRefundRequest(sourceId);
      case "boost":
        return this.sourceOfBoost(sourceId);
      case "membership":
        return this.sourceOfMembership(sourceId);
      default:
        return this.sourceOfPackageOrOrder(sourceId);
    }
  }

  /** İade faturası: ters çevirdiği belgenin kaynağını gösterir. */
  private async sourceOfReversedInvoice(
    sourceId: string,
  ): Promise<InvoiceSourceRow[]> {
    const original = await this.prisma.elogoInvoice.findUnique({
      where: { id: sourceId.split(":")[0] },
      select: { type: true, sourceId: true },
    });
    // Bir iade faturasının kaynağı yine bir iade faturası olamaz; olsaydı bu
    // özyineleme belgeler arasında dönüp yığını taşırır ve dökümü 500 yapardı.
    return original && original.type !== "return_invoice"
      ? this.buildSource(original.type, original.sourceId)
      : [];
  }

  /**
   * Üyelik belgesi SİPARİŞ ya da üyelik ÖDEMESİ anahtarlı olabilir — iki nesil
   * de çözülür, `invoice-parties.ts`'teki taraf çözümüyle aynı ikilik.
   */
  private async sourceOfMembership(
    sourceId: string,
  ): Promise<InvoiceSourceRow[]> {
    const rows = await this.sourceOfPackageOrOrder(sourceId);
    if (rows.length > 0) return rows;
    const payment = await this.prisma.membershipPayment.findUnique({
      where: { id: sourceId },
      select: { orderId: true },
    });
    return payment?.orderId ? this.sourceOfPackageOrOrder(payment.orderId) : [];
  }

  private async sourceOfTrade(sourceId: string): Promise<InvoiceSourceRow[]> {
    const payment = await this.prisma.tradeCashPayment.findUnique({
      where: { id: sourceId },
      select: {
        amount: true,
        tradeFeeAmount: true,
        shippingAmount: true,
        commission: true,
        paidAt: true,
        createdAt: true,
        trade: { select: { tradeNumber: true } },
      },
    });
    if (!payment) return [];
    const reference = payment.trade?.tradeNumber ?? "";
    const occurredAt = payment.paidAt ?? payment.createdAt;
    const rows: InvoiceSourceRow[] = [];
    const push = (description: string, value: number) => {
      if (value > 0)
        rows.push({
          reference,
          description,
          quantity: null,
          amount: value,
          occurredAt,
        });
    };
    push("Takas nakit farkı", Number(payment.amount));
    push("Takas hizmet bedeli", Number(payment.tradeFeeAmount));
    push("Takas kargo bedeli", Number(payment.shippingAmount));
    push("Takas komisyonu (v1)", Number(payment.commission));
    return rows;
  }

  private async sourceOfRefundRequest(
    sourceId: string,
  ): Promise<InvoiceSourceRow[]> {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: sourceId },
      select: {
        refundNumber: true,
        amount: true,
        createdAt: true,
        order: {
          select: { orderNumber: true, product: { select: { title: true } } },
        },
      },
    });
    if (!request) return [];
    return [
      {
        reference: request.refundNumber,
        description: `İade talebi — ${request.order?.product?.title ?? ""} (${
          request.order?.orderNumber ?? ""
        })`.trim(),
        quantity: null,
        amount: Number(request.amount),
        occurredAt: request.createdAt,
      },
    ];
  }

  private async sourceOfBoost(sourceId: string): Promise<InvoiceSourceRow[]> {
    const boost = await this.prisma.productBoost.findUnique({
      where: { id: sourceId },
      select: {
        packageName: true,
        durationDays: true,
        price: true,
        purchasedAt: true,
        createdAt: true,
        orderId: true,
        product: { select: { title: true } },
      },
    });
    if (!boost) return [];
    const order = boost.orderId
      ? await this.prisma.order.findUnique({
          where: { id: boost.orderId },
          select: { orderNumber: true },
        })
      : null;
    return [
      {
        reference: order?.orderNumber ?? "",
        description: `${boost.packageName ?? "Öne çıkarma"} — ${
          boost.product?.title ?? ""
        }`.trim(),
        quantity: boost.durationDays,
        amount: Number(boost.price),
        occurredAt: boost.purchasedAt ?? boost.createdAt,
      },
    ];
  }

  /**
   * Ücret belgeleri KOLİ anahtarlıdır (koli içindeki her sipariş bir satır);
   * platform satışı, üyelik ve koli anahtarına geçilmeden önceki eski belgeler
   * SİPARİŞ anahtarlıdır.
   */
  private async sourceOfPackageOrOrder(
    sourceId: string,
  ): Promise<InvoiceSourceRow[]> {
    // `satisfies` ŞART: select bir DEĞİŞKENDE durduğu için Prisma'nın jeneriği
    // alan adlarını doğrulamıyor — `paidAt` böyle geçmişti ve `Order`'da öyle
    // bir alan olmadığı için döküm canlıda 500 veriyordu (TARODAN-API-20).
    // Ödeme tarihi `Payment`'ta durur, siparişte değil.
    const orderSelect = {
      orderNumber: true,
      quantity: true,
      totalAmount: true,
      createdAt: true,
      payment: { select: { paidAt: true } },
      product: { select: { title: true } },
    } satisfies Prisma.OrderSelect;
    const pkg = await this.prisma.orderPackage.findUnique({
      where: { id: sourceId },
      select: {
        orders: { select: orderSelect, orderBy: { createdAt: "asc" } },
      },
    });
    const orders = pkg
      ? pkg.orders
      : await this.prisma.order
          .findUnique({ where: { id: sourceId }, select: orderSelect })
          .then((order) => (order ? [order] : []));
    return orders.map((order) => ({
      reference: order.orderNumber,
      description: order.product?.title ?? "",
      quantity: order.quantity,
      amount: Number(order.totalAmount),
      occurredAt: order.payment?.paidAt ?? order.createdAt,
    }));
  }
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;
