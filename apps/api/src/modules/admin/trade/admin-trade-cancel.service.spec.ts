import { BadRequestException, ConflictException } from "@nestjs/common";
import { TradeStatus } from "@prisma/client";
import type { AdminTradeCancelRefundLine } from "@tarodan/types";
import type {
  TradePlatformCancelHooks,
  TradePlatformCancelRecord,
} from "../../trade/lifecycle/trade-platform-cancel.service";
import { AdminTradeCancelService } from "./admin-trade-cancel.service";

/**
 * Admin "Takası iptal et": bu servis yalnız girdi kuralını ve denetim izini
 * taşır; uygunluk, iptal, iade ve duyuru domain servisindedir. Sabitlenen:
 * zorunlu denetim kaydının iptalle AYNI tx'e girmesi (fail-closed), iç notun
 * yalnız denetimde kalması, iade sonucunun kaydı ve reddedilen denemelerin izi.
 */
describe("AdminTradeCancelService", () => {
  const TX = { __tx: true };
  const refunds: AdminTradeCancelRefundLine[] = [
    { userId: "u1", side: "initiator", paid: true, refundAmount: 230 },
    { userId: "u2", side: "receiver", paid: false, refundAmount: 0 },
  ];
  const record: TradePlatformCancelRecord = {
    tradeId: "t1",
    tradeNumber: "TKS-1",
    stageBefore: TradeStatus.awaiting_payment,
    reasonCode: "suspicious_activity",
    initiatorId: "u1",
    receiverId: "u2",
    refunds,
    releasedReservations: [{ productId: "p1", quantity: 1 }],
  };

  const makeService = (
    outcome: Partial<{
      alreadyCancelled: boolean;
      refundFailed: boolean;
      refundOutcome: Record<string, unknown> | null;
    }> = {},
  ) => {
    const audit = {
      createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    };
    const tradeService = {
      previewPlatformCancel: jest.fn().mockResolvedValue({ tradeId: "t1" }),
      cancelByPlatform: jest.fn(
        async (
          _tradeId: string,
          _code: string,
          hooks: TradePlatformCancelHooks,
        ) => {
          if (!outcome.alreadyCancelled) {
            await hooks.onCancelled(TX as never, record);
          }
          return {
            tradeId: "t1",
            alreadyCancelled: outcome.alreadyCancelled ?? false,
            refunds: outcome.alreadyCancelled ? [] : refunds,
            refundFailed: outcome.refundFailed ?? false,
            refundOutcome:
              outcome.refundOutcome === undefined
                ? { refunded: true, failed: false }
                : outcome.refundOutcome,
          };
        },
      ),
    };
    const service = new AdminTradeCancelService(
      audit as never,
      tradeService as never,
    );
    return { service, audit, tradeService };
  };

  it("zorunlu denetim kaydını iptalin tx'iyle, aşama/kod/not/iade/rezervasyonla yazar", async () => {
    const { service, audit, tradeService } = makeService();

    const result = await service.cancelTrade("admin-1", "t1", {
      reasonCode: "suspicious_activity",
      note: "  Aynı kartla 5 hesap  ",
    });

    expect(tradeService.cancelByPlatform).toHaveBeenCalledWith(
      "t1",
      "suspicious_activity",
      expect.objectContaining({ onCancelled: expect.any(Function) }),
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_admin_cancel",
      "Trade",
      "t1",
      { status: TradeStatus.awaiting_payment },
      {
        status: "cancelled",
        cancelledBy: "platform",
        reasonCode: "suspicious_activity",
        note: "Aynı kartla 5 hesap",
        refunds,
        releasedReservations: [{ productId: "p1", quantity: 1 }],
      },
      TX,
    );
    expect(result).toEqual({
      tradeId: "t1",
      alreadyCancelled: false,
      refunds,
      refundFailed: false,
    });
  });

  it("iç not domain çağrısına ve yanıta HİÇ girmez (taraflara giden yüklerden ayrı)", async () => {
    const { service, tradeService } = makeService();

    const result = await service.cancelTrade("admin-1", "t1", {
      reasonCode: "other",
      note: "GİZLİ-İÇ-NOT",
    });

    expect(
      JSON.stringify(tradeService.cancelByPlatform.mock.calls[0]),
    ).not.toContain("GİZLİ-İÇ-NOT");
    expect(JSON.stringify(result)).not.toContain("GİZLİ-İÇ-NOT");
  });

  it("denetim yazımı patlarsa hata yükselir (domain tx'i geri alır) ve deneme kaydı bırakılır", async () => {
    const { service, audit } = makeService();
    audit.createRequiredAuditLog.mockRejectedValueOnce(
      new Error("Active admin user not found"),
    );

    await expect(
      service.cancelTrade("admin-1", "t1", { reasonCode: "stock_error" }),
    ).rejects.toThrow("Active admin user not found");
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_admin_cancel_failed",
      "Trade",
      "t1",
      null,
      expect.objectContaining({ reasonCode: "stock_error" }),
    );
  });

  it.each(["", "   ", undefined])(
    "'Diğer' + boş not (%p) → 400, domain'e hiç gidilmez, deneme kaydı bırakılır",
    async (note) => {
      const { service, audit, tradeService } = makeService();

      await expect(
        service.cancelTrade("admin-1", "t1", { reasonCode: "other", note }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tradeService.cancelByPlatform).not.toHaveBeenCalled();
      expect(audit.createAuditLog).toHaveBeenCalledWith(
        "admin-1",
        "trade_admin_cancel_failed",
        "Trade",
        "t1",
        null,
        expect.objectContaining({ reasonCode: "other" }),
      );
    },
  );

  it("'Diğer' dışındaki kodda not opsiyoneldir", async () => {
    const { service, audit } = makeService();
    await service.cancelTrade("admin-1", "t1", { reasonCode: "user_request" });
    expect(audit.createRequiredAuditLog.mock.calls[0][5]).toEqual(
      expect.objectContaining({ note: null }),
    );
  });

  it("engel (ör. koli yolda) → hata aynen yükselir ve deneme kaydı bırakılır", async () => {
    const { service, audit, tradeService } = makeService();
    tradeService.cancelByPlatform.mockRejectedValueOnce(
      new ConflictException(),
    );

    await expect(
      service.cancelTrade("admin-1", "t1", { reasonCode: "stock_error" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_admin_cancel_failed",
      "Trade",
      "t1",
      null,
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it("commit sonrası iade sonucu ayrı bir denetim satırına yazılır; başarısız iade yanıtta görünür", async () => {
    const { service, audit } = makeService({
      refundFailed: true,
      refundOutcome: { refunded: false, failed: true, reason: "PayTR 503" },
    });

    const result = await service.cancelTrade("admin-1", "t1", {
      reasonCode: "stock_error",
    });

    expect(result.refundFailed).toBe(true);
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_admin_cancel_refund",
      "Trade",
      "t1",
      null,
      expect.objectContaining({
        reasonCode: "stock_error",
        refunds,
        failed: true,
        reason: "PayTR 503",
      }),
    );
  });

  it("çift gönderim (zaten platform iptali): denetim ve iade kaydı yazılmaz", async () => {
    const { service, audit } = makeService({
      alreadyCancelled: true,
      refundOutcome: null,
    });

    const result = await service.cancelTrade("admin-1", "t1", {
      reasonCode: "stock_error",
    });

    expect(result.alreadyCancelled).toBe(true);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    expect(audit.createAuditLog).not.toHaveBeenCalled();
  });

  it("çift gönderim önceki isteğin yarım kalan iadesini tamamladıysa: yeni iptal denetimi yok, iade sonucu kaydedilir", async () => {
    const { service, audit } = makeService({
      alreadyCancelled: true,
      refundOutcome: { refunded: true, failed: false },
    });

    const result = await service.cancelTrade("admin-1", "t1", {
      reasonCode: "stock_error",
    });

    expect(result.alreadyCancelled).toBe(true);
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
    expect(audit.createAuditLog).toHaveBeenCalledWith(
      "admin-1",
      "trade_admin_cancel_refund",
      "Trade",
      "t1",
      null,
      expect.objectContaining({ refunded: true, failed: false }),
    );
  });

  it("önizleme domain servisine gider", async () => {
    const { service, tradeService } = makeService();
    await service.previewCancel("t1");
    expect(tradeService.previewPlatformCancel).toHaveBeenCalledWith("t1");
  });
});
