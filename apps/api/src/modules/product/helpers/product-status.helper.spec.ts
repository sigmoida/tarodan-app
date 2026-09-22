import { shouldQuarantineReturnedStock } from "./product-status.helper";

/**
 * PO kararı: "İade edilen ürün otomatik stoğa döner ama hasarlı olabilir; ilan
 * PASİF kalmalı, satıcı kendisi aktive eder." Tek sinyal `Order.deliveredAt` —
 * bu alan yalnız `PaymentHoldReleaseService.handleOrderDelivered` tarafından
 * (webhook/poller/admin fark etmeksizin) TEK kanonik yoldan damgalanır.
 */
describe("shouldQuarantineReturnedStock", () => {
  it("teslim edilmiş sipariş (deliveredAt dolu) → karantina (true)", () => {
    expect(
      shouldQuarantineReturnedStock(new Date("2026-09-10T10:00:00Z")),
    ).toBe(true);
  });

  it("hiç teslim edilmemiş sipariş (deliveredAt null) → karantina YOK (false)", () => {
    expect(shouldQuarantineReturnedStock(null)).toBe(false);
  });
});
