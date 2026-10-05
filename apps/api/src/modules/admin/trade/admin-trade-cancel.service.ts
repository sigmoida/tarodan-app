import { BadRequestException, Injectable } from "@nestjs/common";
import {
  isAdminCancelNoteRequired,
  type AdminTradeCancelPreview,
  type AdminTradeCancelResult,
} from "@tarodan/types";
import { AdminAuditService } from "../ops/admin-audit.service";
import { TradeService } from "../../trade/trade.service";
import { i18nMessage } from "../../i18n";
import { errorMessage } from "../../../common/helpers/error-message";
import { AdminCancelTradeDto } from "../dto";

/**
 * Admin "Takası iptal et" — yalnız denetim ve girdi kuralı burada yaşar.
 * Uygunluk (`@tarodan/types` ortak kuralı, satır kilidi altında), iptal,
 * iade ve taraf duyurusu domain servisindedir (TradeService →
 * TradePlatformCancelService); admin doğrudan Prisma'ya yazmaz.
 *
 * Denetim:
 *   - `trade_admin_cancel` ZORUNLU, iptalle AYNI tx'te (fail-closed): yazılamazsa
 *     iptal, rezervasyon çözümü ve duyuru geri alınır.
 *   - `trade_admin_cancel_refund`: commit SONRASI iade sonucu. İade harici bir
 *     sağlayıcı çağrısıdır, iptalle atomik olamaz; başarısızlığın kalıcı kaydı
 *     takastaki `refundFailureReason` işaretidir (retry-refund + retry cron'u).
 *     Bu satır best-effort'tur: iptal zaten commit oldu, hata 500'e dönmez.
 *   - `trade_admin_cancel_failed`: reddedilen / patlayan deneme (best-effort).
 */
@Injectable()
export class AdminTradeCancelService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly tradeService: TradeService,
  ) {}

  async previewCancel(tradeId: string): Promise<AdminTradeCancelPreview> {
    return this.tradeService.previewPlatformCancel(tradeId);
  }

  async cancelTrade(
    adminId: string,
    tradeId: string,
    dto: AdminCancelTradeDto,
  ): Promise<AdminTradeCancelResult> {
    const reasonCode = dto.reasonCode;
    const note = dto.note?.trim() || null;

    try {
      if (isAdminCancelNoteRequired(reasonCode) && !note) {
        throw new BadRequestException(
          i18nMessage("server.admin.trade.cancelNoteRequired"),
        );
      }

      const outcome = await this.tradeService.cancelByPlatform(
        tradeId,
        reasonCode,
        {
          onCancelled: async (tx, record) => {
            await this.audit.createRequiredAuditLog(
              adminId,
              "trade_admin_cancel",
              "Trade",
              tradeId,
              { status: record.stageBefore },
              {
                status: "cancelled",
                cancelledBy: "platform",
                reasonCode,
                note,
                refunds: record.refunds,
                releasedReservations: record.releasedReservations,
              },
              tx,
            );
          },
        },
      );

      if (outcome.refundOutcome) {
        await this.audit.createAuditLog(
          adminId,
          "trade_admin_cancel_refund",
          "Trade",
          tradeId,
          null,
          {
            reasonCode,
            refunds: outcome.refunds,
            ...outcome.refundOutcome,
          },
        );
      }

      return {
        tradeId: outcome.tradeId,
        alreadyCancelled: outcome.alreadyCancelled,
        refunds: outcome.refunds,
        refundFailed: outcome.refundFailed,
      };
    } catch (error: unknown) {
      // Reddedilen deneme de iz bırakır (engel, yarış, denetim hatası).
      await this.audit.createAuditLog(
        adminId,
        "trade_admin_cancel_failed",
        "Trade",
        tradeId,
        null,
        { reasonCode, note, error: errorMessage(error) },
      );
      throw error;
    }
  }
}
