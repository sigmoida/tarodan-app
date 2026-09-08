import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../prisma";
import { paginate } from "../../../../common/list";
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
      { where, orderBy: { deliveredAt: "desc" }, select: SELECT },
      query,
    );
    const orders = result.data as SettlementOrder[];
    return { ...result, data: await this.rowsOf(orders) };
  }

  /** Excel için TÜM satırlar (tavana kadar) — sayfalama yok. */
  async rows(query: SettlementReportQueryDto): Promise<SettlementRow[]> {
    const orders = await this.prisma.order.findMany({
      where: this.whereOf(query),
      orderBy: { deliveredAt: "desc" },
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
          select: { orderId: true, releaseAt: true },
        })
      : [];
    const releaseByOrder = new Map(
      holds.map((h) => [h.orderId, h.releaseAt ?? null]),
    );
    return orders.map((o) => this.rowOf(o, releaseByOrder.get(o.id) ?? null));
  }

  private whereOf(query: SettlementReportQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { deliveredAt: { not: null } };
    if (query.startDate || query.endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (query.startDate) range.gte = new Date(query.startDate);
      if (query.endDate) range.lte = new Date(query.endDate);
      where.deliveredAt = range;
    }
    if (query.sellerId) where.sellerId = query.sellerId;
    return where;
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
      unitPrice: order.unitPrice != null ? Number(order.unitPrice) : null,
      subtotal: order.subtotal != null ? Number(order.subtotal) : null,
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
      // Misafir siparişinde alıcı kaydı paylaşılan sistem kullanıcısıdır;
      // gerçek isim yalnız kargo adresinde durur.
      buyerName:
        guestNameOf(order.shippingAddress) ?? order.buyer?.displayName ?? "",
      productName: order.product?.title ?? "",
      productCode: order.product?.productCode ?? "",
    });
  }
}

/** Misafir siparişinin kargo adresindeki gerçek alıcı adı. */
function guestNameOf(shippingAddress: Prisma.JsonValue): string | null {
  if (!shippingAddress || typeof shippingAddress !== "object") return null;
  const raw = (shippingAddress as Record<string, unknown>).guestName;
  const name = typeof raw === "string" ? raw.trim() : "";
  return name && name !== "GUEST_SYSTEM" ? name : null;
}
