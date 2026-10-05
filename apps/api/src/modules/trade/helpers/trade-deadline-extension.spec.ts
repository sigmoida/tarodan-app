import { PaymentStatus, TradeStatus } from "@prisma/client";
import {
  evaluatePaymentExtension,
  tradeExtendedDeadline,
  tradeExtensionClaimData,
  tradeExtensionClaimWhere,
  tradeExtensionStageOf,
  tradeStageDeadline,
  tradeStageExtendedAt,
} from "./trade-deadline-extension";

describe("trade-deadline-extension helpers", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  describe("tradeExtensionStageOf", () => {
    it("pending → yanıt, awaiting_payment → ödeme, diğer her statü uzatılamaz", () => {
      expect(tradeExtensionStageOf(TradeStatus.pending)).toBe("response");
      expect(tradeExtensionStageOf(TradeStatus.awaiting_payment)).toBe(
        "payment",
      );
      for (const status of [
        TradeStatus.accepted,
        TradeStatus.shipping_to_warehouse,
        TradeStatus.at_warehouse,
        TradeStatus.completed,
        TradeStatus.cancelled,
      ]) {
        expect(tradeExtensionStageOf(status)).toBeNull();
      }
    });
  });

  describe("aşama alanları", () => {
    const trade = {
      responseDeadline: new Date("2026-10-01T00:00:00.000Z"),
      paymentDeadline: new Date("2026-10-02T00:00:00.000Z"),
      responseExtendedAt: new Date("2026-10-03T00:00:00.000Z"),
      paymentExtendedAt: null,
    };

    it("her aşama kendi son tarihini ve kendi hak damgasını okur", () => {
      expect(tradeStageDeadline(trade, "response")).toBe(
        trade.responseDeadline,
      );
      expect(tradeStageDeadline(trade, "payment")).toBe(trade.paymentDeadline);
      expect(tradeStageExtendedAt(trade, "response")).toBe(
        trade.responseExtendedAt,
      );
      expect(tradeStageExtendedAt(trade, "payment")).toBeNull();
    });
  });

  it("yeni son tarih: şimdi + tam süre (eski tarihe eklenmez)", () => {
    expect(tradeExtendedDeadline(NOW, 72)).toEqual(
      new Date(NOW.getTime() + 72 * HOUR),
    );
  });

  describe("hak talebi (koşullu-atomik)", () => {
    it("yanıt: aynı statü, geçmiş son tarih, kullanılmamış hak", () => {
      expect(tradeExtensionClaimWhere("t1", "response", NOW)).toEqual({
        id: "t1",
        status: TradeStatus.pending,
        responseDeadline: { lt: NOW },
        responseExtendedAt: null,
      });
    });

    it("ödeme: aynı statü, geçmiş son tarih, kullanılmamış hak", () => {
      expect(tradeExtensionClaimWhere("t1", "payment", NOW)).toEqual({
        id: "t1",
        status: TradeStatus.awaiting_payment,
        paymentDeadline: { lt: NOW },
        paymentExtendedAt: null,
      });
    });

    it("yazım yalnız ilgili aşamanın alanlarını değiştirir ve version'a dokunmaz", () => {
      const deadline = new Date(NOW.getTime() + HOUR);
      expect(tradeExtensionClaimData("response", deadline, NOW)).toEqual({
        responseDeadline: deadline,
        responseExtendedAt: NOW,
      });
      expect(tradeExtensionClaimData("payment", deadline, NOW)).toEqual({
        paymentDeadline: deadline,
        paymentExtendedAt: NOW,
      });
    });
  });

  describe("evaluatePaymentExtension", () => {
    const row = (payerId: string, status: PaymentStatus) => ({
      payerId,
      status,
    });

    it("bekleyen ödemesi olan tarafları döner (tamamlayan taraf hatırlatılmaz)", () => {
      expect(
        evaluatePaymentExtension([
          row("u1", PaymentStatus.completed),
          row("u2", PaymentStatus.pending),
        ]),
      ).toEqual({ blocker: null, recipients: ["u2"] });
    });

    it("processing ve failed satırlar bekleyen sayılır", () => {
      expect(
        evaluatePaymentExtension([
          row("u1", PaymentStatus.processing),
          row("u2", PaymentStatus.failed),
        ]),
      ).toEqual({ blocker: null, recipients: ["u1", "u2"] });
    });

    it("satır yoksa uzatılamaz", () => {
      expect(evaluatePaymentExtension([])).toEqual({
        blocker: "noPaymentRows",
        recipients: [],
      });
    });

    it("iade edilmiş satır varsa uzatılamaz", () => {
      expect(
        evaluatePaymentExtension([
          row("u1", PaymentStatus.refunded),
          row("u2", PaymentStatus.pending),
        ]).blocker,
      ).toBe("refundedRow");
    });

    it("bekleyen ödeme kalmadıysa uzatılamaz", () => {
      expect(
        evaluatePaymentExtension([
          row("u1", PaymentStatus.completed),
          row("u2", PaymentStatus.completed),
        ]).blocker,
      ).toBe("nothingOutstanding");
    });
  });
});
