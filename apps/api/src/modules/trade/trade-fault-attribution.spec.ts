import { TradeStatus } from "@prisma/client";
import { AdminTradeWarehouseService } from "../admin/trade/admin-trade-warehouse.service";
import { refundableAmountFor } from "./trade-refund-policy";

/**
 * KUSURSUZ TARAF HİÇBİR ŞEY KAYBETMEZ.
 *
 * Takas bir tarafın kusuru olmadan bozulduğunda (karşı taraf ödemedi,
 * vazgeçti, kargolamadı; karşı tarafın ürünü kontrolden geçmedi; koli kayboldu)
 * o tarafın ödemesi hizmet bedeli ve kargo DAHİL tam iade edilir. Karar iptali
 * yazan yolda verilir ve `TradeCashPayment.fullRefundEntitled` olarak satıra
 * kaydedilir — iade sağlayıcıda patlayıp retry cron'una düşse bile tutar aynı
 * hesaplanır.
 */
describe("kusursuz taraf işaretlemesi", () => {
  describe("depo reddi", () => {
    const makeService = (faultySide: string) => {
      const cashUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        trade: {
          findUnique: jest.fn().mockResolvedValue({
            id: "trade-1",
            status: TradeStatus.at_warehouse,
            initiatorId: "ali",
            receiverId: "burak",
            tradeNumber: "TKS-1",
            initiatorAddressId: null,
            receiverAddressId: null,
            items: [],
            cashPayments: [],
          }),
          update: jest
            .fn()
            .mockResolvedValue({ status: TradeStatus.returning }),
        },
        address: {
          findFirst: jest.fn().mockResolvedValue({
            id: "addr",
            fullName: "X",
            address: "a",
            city: "c",
            district: "d",
            phone: "p",
          }),
        },
        tradeShipment: { create: jest.fn().mockResolvedValue({ id: "ship" }) },
        tradeCashPayment: { updateMany: cashUpdateMany },
      };
      const service = new AdminTradeWarehouseService(
        {
          $transaction: jest.fn((cb: any) => cb(tx)),
          trade: {
            findUnique: jest.fn().mockResolvedValue({
              id: "trade-1",
              status: TradeStatus.at_warehouse,
              shipments: [],
            }),
          },
          user: { findUnique: jest.fn().mockResolvedValue({}) },
          tradeShipment: { update: jest.fn() },
        } as any,
        { createAuditLog: jest.fn() } as any,
        { refundTradeCashTracked: jest.fn().mockResolvedValue({}) } as any,
        { emitTradeWarehouseRejected: jest.fn() } as any,
        { createInAppNotification: jest.fn() } as any,
        { resolveWarehouseAddressId: jest.fn().mockResolvedValue("wh") } as any,
      );
      return { service, cashUpdateMany };
    };

    it("teklifi başlatanın ürünü elendiyse ALAN taraf tam iade hakkı kazanır", async () => {
      const { service, cashUpdateMany } = makeService("initiator");
      await service.rejectWarehouseTrade("admin-1", "trade-1", {
        reason: "İlanda kutulu yazan üründe kutu yok",
        faultySide: "initiator",
      });
      expect(cashUpdateMany).toHaveBeenCalledWith({
        where: { tradeId: "trade-1", payerId: { in: ["burak"] } },
        data: { fullRefundEntitled: true },
      });
    });

    it("operasyonel redde (neither) iki taraf da tam iade alır", async () => {
      const { service, cashUpdateMany } = makeService("neither");
      await service.rejectWarehouseTrade("admin-1", "trade-1", {
        reason: "Depo kaynaklı operasyonel red",
        faultySide: "neither",
      });
      expect(cashUpdateMany).toHaveBeenCalledWith({
        where: { tradeId: "trade-1", payerId: { in: ["ali", "burak"] } },
        data: { fullRefundEntitled: true },
      });
    });

    it("iki ürün de elendiyse kimse tam iade almaz", async () => {
      const { service, cashUpdateMany } = makeService("both");
      await service.rejectWarehouseTrade("admin-1", "trade-1", {
        reason: "Her iki ürün de ilanına uymuyor",
        faultySide: "both",
      });
      expect(cashUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("tutara etkisi", () => {
    // 35 hizmet bedeli + 60 kargo + 200 nakit fark
    const payment = {
      totalAmount: 295,
      shippingAmount: 60,
      tradeFeeAmount: 35,
    };

    it("kusurlu tarafta ürün yola çıktıysa yalnız nakit fark iade edilir", () => {
      expect(refundableAmountFor(payment, { handedToCargo: true })).toBe(200);
    });

    it("kusursuz tarafta aynı takasta tahsil edilenin tamamı iade edilir", () => {
      expect(
        refundableAmountFor(
          { ...payment, fullRefundEntitled: true },
          { handedToCargo: true },
        ),
      ).toBe(295);
    });
  });
});
