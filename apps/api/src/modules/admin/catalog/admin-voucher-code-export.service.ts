import { Injectable } from "@nestjs/common";
import type { Locale } from "@tarodan/i18n";
import { EXPORT_CATALOGS, type ExportCatalogKey } from "@tarodan/types";

import { PrismaService } from "../../../prisma";
import {
  ExportListService,
  type ExportFile,
  type ExportRecord,
} from "../../../common/export";
import { DiscountService } from "../../discount/discount.service";

type VoucherCodeRow = Awaited<
  ReturnType<DiscountService["listCodesPage"]>
>[number];

/** Döküm satırı: kod + sipariş NUMARASI (kod yalnız siparişin id'sini taşır). */
export type VoucherCodeExportRow = VoucherCodeRow & {
  orderNumber: string | null;
};

/**
 * Bir indirim şablonunun tek kullanımlık kodlarının Excel dökümü. Kodlar
 * paraya denk olduğu için uç kod ÜRETİMİYLE aynı rolde kapalıdır
 * (super_admin + admin) ve her indirme denetim kaydı bırakır; eski CSV
 * moderator'e açıktı, tavansızdı ve iz bırakmıyordu.
 */
@Injectable()
export class AdminVoucherCodeExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountService,
    private readonly exports: ExportListService,
  ) {}

  async exportCodes(
    discountId: string,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    // Şablon yoksa 404 (domain servisinin kuralı) — boş dosya değil.
    const discount = await this.discounts.findOne(discountId, actorId, true);
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.voucherCodes,
      locale,
      slug: "voucher-kodlari",
      titleKey: "admin.marketing.discounts.codes.exportTitle",
      filters: [
        { labelKey: "admin.marketing.discounts.discount", value: discount.name },
        { labelKey: "admin.marketing.discounts.code", value: discount.code },
      ],
      fetchPage: async (page) =>
        this.withOrderNumbers(
          await this.discounts.listCodesPage(discountId, page),
        ),
      map: voucherCodeExportRecord,
      audit: {
        actorId,
        action: "voucher_codes_export",
        entityType: "Discount",
        entityId: discountId,
        query: { discountId },
      },
    });
  }

  /** Sipariş numaraları tek sorguda (okuma modeli; yazım yok). */
  private async withOrderNumbers(
    codes: VoucherCodeRow[],
  ): Promise<VoucherCodeExportRow[]> {
    const ids = [
      ...new Set(codes.map((c) => c.orderId).filter((v): v is string => !!v)),
    ];
    const orders = ids.length
      ? await this.prisma.order.findMany({
          where: { id: { in: ids } },
          select: { id: true, orderNumber: true },
        })
      : [];
    const numberById = new Map(orders.map((o) => [o.id, o.orderNumber]));
    return codes.map((code) => ({
      ...code,
      orderNumber: code.orderId ? (numberById.get(code.orderId) ?? null) : null,
    }));
  }
}

export function voucherCodeExportRecord(
  row: VoucherCodeExportRow,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.voucherCodes>> {
  return {
    code: row.code,
    isRedeemed: row.isRedeemed,
    redeemedAt: row.redeemedAt,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
  };
}
