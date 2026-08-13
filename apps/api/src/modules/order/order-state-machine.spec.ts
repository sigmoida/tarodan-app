import { OrderStatus } from "@prisma/client";
import {
  ORDER_TRANSITION_RULES,
  SHIPPABLE_ORDER_STATUSES,
  isOrderTransitionAllowed,
} from "./order-state-machine";

/**
 * Grafik ile KOD arasındaki sözleşme. Sipariş statüsünü yazan tek bir kapı
 * yoktur (her komut kendi koşullu-atomik guard'ını uygular), bu yüzden tablo
 * sessizce gerçeklikten kopabiliyordu — denetimde "grafikte olmayan geçiş"
 * olarak geri döndü. Bu testler canlı komutların ürettiği kenarları sabitler.
 */
describe("sipariş durum grafiği — canlı kenar sözleşmesi", () => {
  it("kargoya veriliş, SHIPPABLE statülerin HEPSİNDEN mümkündür", () => {
    for (const from of SHIPPABLE_ORDER_STATUSES) {
      expect(isOrderTransitionAllowed(from, OrderStatus.shipped)).toBe(true);
    }
  });

  it("teslim handler'ının yazdığı kenarlar tablodadır (48h dahil)", () => {
    // handleOrderDelivered: shipped → delivered | awaiting_buyer_confirmation.
    expect(
      isOrderTransitionAllowed(OrderStatus.shipped, OrderStatus.delivered),
    ).toBe(true);
    expect(
      isOrderTransitionAllowed(
        OrderStatus.shipped,
        OrderStatus.awaiting_buyer_confirmation,
      ),
    ).toBe(true);
    // İlk-hareket geçişi kaçırılmış siparişte teslim doğrudan preparing'den gelir.
    expect(
      isOrderTransitionAllowed(OrderStatus.preparing, OrderStatus.delivered),
    ).toBe(true);
    expect(
      isOrderTransitionAllowed(
        OrderStatus.preparing,
        OrderStatus.awaiting_buyer_confirmation,
      ),
    ).toBe(true);
  });

  it("İPTAL EDİLMİŞ sipariş kargoya verilemez (para açığının kök kuralı)", () => {
    expect(
      isOrderTransitionAllowed(OrderStatus.cancelled, OrderStatus.shipped),
    ).toBe(false);
    expect(
      SHIPPABLE_ORDER_STATUSES.includes(OrderStatus.cancelled as never),
    ).toBe(false);
    expect(
      SHIPPABLE_ORDER_STATUSES.includes(OrderStatus.refund_requested as never),
    ).toBe(false);
  });

  it("iptalden tek çıkış, teklif yeniden aktifleştirmesidir", () => {
    expect(
      isOrderTransitionAllowed(
        OrderStatus.cancelled,
        OrderStatus.pending_payment,
      ),
    ).toBe(true);
    expect(ORDER_TRANSITION_RULES[OrderStatus.cancelled]).toHaveLength(1);
  });

  it("iade edilen sipariş terminaldir", () => {
    expect(ORDER_TRANSITION_RULES[OrderStatus.refunded]).toEqual([]);
  });

  it("kargo sonrası tam iade siparişi kapatır", () => {
    expect(
      isOrderTransitionAllowed(OrderStatus.shipped, OrderStatus.cancelled),
    ).toBe(true);
    expect(
      isOrderTransitionAllowed(OrderStatus.delivered, OrderStatus.cancelled),
    ).toBe(true);
  });

  it("tabloda tanımsız bir hedefe geçiş yoktur (ör. teslimden kargoya dönüş)", () => {
    expect(
      isOrderTransitionAllowed(OrderStatus.delivered, OrderStatus.shipped),
    ).toBe(false);
    expect(
      isOrderTransitionAllowed(OrderStatus.completed, OrderStatus.shipped),
    ).toBe(false);
  });
});
