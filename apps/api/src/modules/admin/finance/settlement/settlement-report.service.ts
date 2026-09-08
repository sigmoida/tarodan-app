import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma";
import {
  buildSearchWhere,
  dateRangeWhere,
  paginate,
  resolveOrderBy,
} from "../../../../common/list";
import { storedProductBaseOf } from "../../../order/helpers/order-charged-base.helper";
import { resolveGuestInvoiceRecipient } from "../../../elogo/invoice/elogo-guest-recipient";
import type { SettlementReportQueryDto } from "../../dto";
import {
  buildSettlementRow,
  type SettlementRow,
} from "./settlement-report-row";

/**
 * SATICI HAKEDİŞ DÖKÜMÜ — kesilen komisyon faturasının dayanağı.
 *
 * Dönem TESLİMAT tarihine göredir: satıcının hak edişi ve platformun kesintisi
 * teslimatla doğar (fatura da o an kesilir), sipariş tarihiyle değil. Teslim
 * edilmemiş sipariş dökümde yer almaz — henüz faturalanacak bir şey yoktur.
 */

/** Excel'e tek seferde yazılacak azami satır; üstü sayfalı uçtan okunur. */
export const SETTLEMENT_EXPORT_MAX_ROWS = 20_000;

/** Ekranda görünen her kolon aranabilir olmalı (#381 tam-içerik araması). */
const SEARCH_FIELDS = [
  "orderNumber",
  "package.packageNumber",
  "seller.displayName",
  "seller.companyName",
  "product.title",
  "product.productCode",
] as const;

const DEFAULT_SORT: Prisma.OrderOrderByWithRelationInput = {
  deliveredAt: "desc",
};

/**
 * Kayıt no (`KYT-…`) türetilmiş bir koddur, kolonu yoktur: gövdesi koli/sipariş
 * numarasının gövdesidir. Bu yüzden sıralama koli numarasına, arama da önekten
 * arındırılmış gövdeye düşer — yoksa ekrandaki kodu kopyalayıp aramak
 * (`KYT-K7X9…`) hiçbir satır getirmezdi.
 */
const SORT_MAP = {
  recordNo: (direction: "asc" | "desc") => ({
    package: { packageNumber: direction },
  }),
} as const;

const CODE_PREFIX = /^[A-Za-zÇĞİÖŞÜçğıöşü]{2,5}-/;

const SELECT = {
  id: true,
  orderNumber: true,
  origin: true,
  cancellationType: true,
  createdAt: true,
  deliveredAt: true,
  quantity: true,
  unitPrice: true,
  subtotal: true,
  // `storedProductBaseOf` için: `subtotal` yazılmamış eski siparişte ürün tabanı
  // alıcı toplamının tanımından tersten okunur.
  totalAmount: true,
  buyerShippingAmount: true,
  shippingCost: true,
  buyerFeeAmount: true,
  taxAmount: true,
  buyerServiceTaxAmount: true,
  sellerFeeAmount: true,
  sellerCommissionAmount: true,
  sellerPlatformFeeAmount: true,
  sellerShippingAmount: true,
  sellerServiceTaxAmount: true,
  withholdingTaxAmount: true,
  sellerId: true,
  buyerId: true,
  shippingAddress: true,
  package: { select: { packageNumber: true } },
  payment: { select: { paidAt: true } },
  seller: { select: { displayName: true, companyName: true } },
  buyer: { select: { displayName: true } },
  product: { select: { title: true, productCode: true } },
} satisfies Prisma.OrderSelect;

type SettlementOrder = Prisma.OrderGetPayload<{ select: typeof SELECT }>;

@Injectable()
export class SettlementReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SettlementReportQueryDto) {
    const where = this.whereOf(query);
    const result = await paginate(
      this.prisma.order,
      { where, orderBy: this.orderByOf(query), select: SELECT },
      query,
    );
    const orders = result.data as SettlementOrder[];
    return { ...result, data: await this.rowsOf(orders) };
  }

  /** Excel için TÜM satırlar (tavana kadar) — sayfalama yok. */
  async rows(query: SettlementReportQueryDto): Promise<SettlementRow[]> {
    const orders = await this.prisma.order.findMany({
      where: this.whereOf(query),
      orderBy: this.orderByOf(query),
      select: SELECT,
      take: SETTLEMENT_EXPORT_MAX_ROWS,
    });
    return this.rowsOf(orders);
  }

  /**
   * Vade tarihi escrow hold'undadır ve `PaymentHold`'un `Order`'a geri ilişkisi
   * yok — sipariş başına ayrı sorgu yerine sayfanın tamamı TEK sorguda çözülür.
   */
  private async rowsOf(orders: SettlementOrder[]): Promise<SettlementRow[]> {
    const holds = orders.length
      ? await this.prisma.paymentHold.findMany({
          where: { orderId: { in: orders.map((o) => o.id) } },
          // Bir sipariş ödeme tekrarında birden fazla hold taşıyabilir
          // (`@@unique([paymentId, orderId])`); vade EN SON hold'undur.
          orderBy: { createdAt: "asc" },
          select: { orderId: true, releaseAt: true },
        })
      : [];
    const releaseByOrder = new Map(
      holds.map((h) => [h.orderId, h.releaseAt ?? null]),
    );
    return orders.map((o) => this.rowOf(o, releaseByOrder.get(o.id) ?? null));
  }

  private orderByOf(
    query: SettlementReportQueryDto,
  ): Prisma.OrderOrderByWithRelationInput {
    return resolveOrderBy<Prisma.OrderOrderByWithRelationInput>(
      "Order",
      query,
      { defaultSort: DEFAULT_SORT, sortMap: SORT_MAP },
    );
  }

  private whereOf(query: SettlementReportQueryDto): Prisma.OrderWhereInput {
    // Dönem ORTAK yardımcıdan: bitiş günü gün SONUNA genişler, yoksa son günün
    // teslimatları dökümden (ve dolayısıyla faturanın dayanağından) düşerdi.
    const where: Prisma.OrderWhereInput = { deliveredAt: { not: null } };
    Object.assign(where, dateRangeWhere(query, "deliveredAt"));
    if (query.sellerId) where.sellerId = query.sellerId;
    const search = buildSearchWhere(searchTermOf(query.search), SEARCH_FIELDS);
    return search ? { ...where, ...search } : where;
  }

  private rowOf(order: SettlementOrder, releaseAt: Date | null): SettlementRow {
    return buildSettlementRow({
      orderNumber: order.orderNumber,
      packageNumber: order.package?.packageNumber ?? null,
      origin: order.origin,
      cancellationType: order.cancellationType,
      createdAt: order.createdAt,
      paidAt: order.payment?.paidAt ?? null,
      deliveredAt: order.deliveredAt,
      releaseAt,
      quantity: order.quantity,
      // Ürün tabanı ORTAK helper'dan — payout ile aynı sayı. Ham `subtotal`
      // okunsaydı kolonu yazılmamış eski siparişte hakediş 0 görünürdü.
      subtotal: storedProductBaseOf(order),
      sellerFeeAmount: Number(order.sellerFeeAmount),
      sellerCommissionAmount: Number(order.sellerCommissionAmount),
      sellerPlatformFeeAmount: Number(order.sellerPlatformFeeAmount),
      sellerShippingAmount: Number(order.sellerShippingAmount),
      sellerServiceTaxAmount: Number(order.sellerServiceTaxAmount),
      withholdingTaxAmount: Number(order.withholdingTaxAmount),
      sellerId: order.sellerId,
      sellerName: order.seller?.displayName ?? "",
      sellerCompanyName: order.seller?.companyName ?? null,
      buyerId: order.buyerId,
      // Misafir siparişinde alıcı kaydı paylaşılan sistem kullanıcısıdır
      // (GUEST_SYSTEM); gerçek isim yalnız kargo adresinde durur ve e-belgeyle
      // AYNI çözücüden okunur.
      buyerName:
        resolveGuestInvoiceRecipient(order.shippingAddress)?.name ??
        order.buyer?.displayName ??
        "",
      productName: order.product?.title ?? "",
      productCode: order.product?.productCode ?? "",
    });
  }
}

/** `KYT-K7X9…` / `PKG-…` / `ORD-…` — önek atılır, gövde her iki kolonu da bulur. */
function searchTermOf(search: string | undefined): string | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  return CODE_PREFIX.test(term) ? term.slice(term.indexOf("-") + 1) : term;
}
