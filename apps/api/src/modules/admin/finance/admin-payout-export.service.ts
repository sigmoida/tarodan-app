import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Locale } from "@tarodan/i18n";
import {
  EXPORT_CATALOGS,
  earlyReleaseDays,
  type ExportCatalogKey,
} from "@tarodan/types";

import { PrismaService } from "../../../prisma";
import {
  ExportListService,
  type ExportFile,
  type ExportRecord,
  type Translate,
} from "../../../common/export";
import type {
  PayoutTransactionsQueryDto,
  PayoutTransfersQueryDto,
} from "../dto";
import {
  AdminPayoutService,
  HOLD_ROW_INCLUDE,
  TRANSFER_LIST_ORDER,
  TRANSFER_ROW_INCLUDE,
} from "./admin-payout.service";

type HoldRow = Awaited<ReturnType<AdminPayoutService["toHoldRows"]>>[number];
type TransferRow = Awaited<
  ReturnType<AdminPayoutService["toTransferRows"]>
>[number];

/**
 * Satıcı ödemeleri ekranının Excel dökümleri — Escrow (hold) ve Transferler
 * sekmeleri ayrı uçlar, çünkü ayrı listeler: eski tek düğme transfer
 * durumlarını hold dökümüne gönderip 400 alıyordu.
 *
 * Dosya = ekran: listeyle AYNI süzgeç, arama ve sıralama
 * (`AdminPayoutService.holdListArgs` / `transferListWhere`), aynı satır
 * eşlemesi (`toHoldRows` / `toTransferRows`). Eski CSV aramayı ve sıralamayı
 * yok sayıyor, 5000 satırda sessizce kesiyor ve denetim bırakmıyordu.
 */
@Injectable()
export class AdminPayoutExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payouts: AdminPayoutService,
    private readonly exports: ExportListService,
  ) {}

  async exportHolds(
    query: PayoutTransactionsQueryDto,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    const { where, orderBy } = await this.payouts.holdListArgs(query);
    const order: Prisma.PaymentHoldOrderByWithRelationInput[] = [
      orderBy,
      { id: "asc" },
    ];
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.payoutHolds,
      locale,
      slug: "satici-odemeleri-escrow",
      titleKey: "admin.finance.payouts.escrowTab",
      filters: [
        {
          labelKey: "common.status",
          value: query.status,
          valueKey: query.status && `status.paymentHold.${query.status}`,
        },
        { labelKey: "admin.finance.common.seller", value: query.sellerId },
        { labelKey: "admin.finance.common.startDate", value: query.dateFrom },
        { labelKey: "admin.finance.common.endDate", value: query.dateTo },
        {
          labelKey: "admin.finance.payouts.filterEarlyOnly",
          value: query.earlyReleased ? true : undefined,
        },
      ],
      sort: query,
      fetchPage: async ({ skip, take }) =>
        this.payouts.toHoldRows(
          await this.prisma.paymentHold.findMany({
            where,
            include: HOLD_ROW_INCLUDE,
            orderBy: order,
            skip,
            take,
          }),
        ),
      map: holdExportRecord,
      audit: {
        actorId,
        action: "payout_holds_export",
        entityType: "PaymentHold",
        query,
      },
    });
  }

  async exportTransfers(
    query: PayoutTransfersQueryDto,
    actorId: string,
    locale: Locale,
  ): Promise<ExportFile> {
    const where = await this.payouts.transferListWhere(query);
    const status = query.status && query.status !== "all" ? query.status : null;
    return this.exports.exportList({
      catalog: EXPORT_CATALOGS.payoutTransfers,
      locale,
      slug: "satici-odemeleri-transferler",
      titleKey: "admin.finance.payouts.transfersTab",
      filters: [
        {
          labelKey: "common.status",
          value: status,
          valueKey: status ? `status.payout.${status}` : undefined,
        },
        { labelKey: "admin.finance.common.startDate", value: query.dateFrom },
        { labelKey: "admin.finance.common.endDate", value: query.dateTo },
      ],
      fetchPage: async ({ skip, take }) =>
        this.payouts.toTransferRows(
          await this.prisma.payoutTransfer.findMany({
            where,
            include: TRANSFER_ROW_INCLUDE,
            orderBy: [TRANSFER_LIST_ORDER, { id: "asc" }],
            skip,
            take,
          }),
        ),
      map: transferExportRecord,
      audit: {
        actorId,
        action: "payout_transfers_export",
        entityType: "PayoutTransfer",
        query,
      },
    });
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Hold satırı. `amount` ekrandaki gibi NET (brüt − kısmi iade); düşülen pay
 * ayrı kolonda. Erken bırakma günü tüm yüzeylerin tek helper'ından.
 */
export function holdExportRecord(
  row: HoldRow,
  t: Translate,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.payoutHolds>> {
  return {
    orderNumber: row.orderNumber === "-" ? null : row.orderNumber,
    sellerName: row.sellerName,
    sellerEmail: row.sellerEmail,
    amount: round2(row.amount - row.refundedAmount),
    refundedAmount: row.refundedAmount,
    status: t(`status.paymentHold.${row.status}`),
    releaseAt: row.releaseAt,
    releasedAt: row.releasedAt,
    earlyReleaseDays: earlyReleaseDays(row.releaseAt, row.releasedAt),
    createdAt: row.createdAt,
  };
}

/** Transfer satırı. IBAN ekrandaki gibi yalnız son 4 hane (KVKK). */
export function transferExportRecord(
  row: TransferRow,
  t: Translate,
): ExportRecord<ExportCatalogKey<typeof EXPORT_CATALOGS.payoutTransfers>> {
  return {
    orderNumber: row.orderNumber,
    sellerName: row.seller.displayName ?? row.seller.email ?? row.seller.id,
    sellerEmail: row.seller.email,
    netAmount: row.netAmount,
    adjustmentDeduction: row.adjustmentDeduction,
    ibanLast4: row.ibanLast4 ? `••${row.ibanLast4}` : null,
    status: t(`status.payout.${row.status}`),
    failureReason: row.failureReason,
    createdAt: row.createdAt,
  };
}
