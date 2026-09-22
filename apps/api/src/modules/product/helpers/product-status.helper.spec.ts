import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import {
  clearStaleInactiveReasonOnWrite,
  shouldQuarantineReturnedStock,
} from "./product-status.helper";

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

/**
 * Bayat işaret satıcıyı yanlış ilanda admin onayını atlatabilir, o yüzden
 * `inactiveReason` statü `inactive` DIŞINA çıkan HER yazımda temizlenmeli —
 * tek entegrasyon noktası `PrismaService`'in Product middleware'i (bkz. orada).
 */
describe("clearStaleInactiveReasonOnWrite", () => {
  it("status inactive DIŞINA çıkıyorsa inactiveReason'ı null yapar", () => {
    const data: Record<string, unknown> = { status: ProductStatus.active };
    clearStaleInactiveReasonOnWrite(data);
    expect(data.inactiveReason).toBeNull();
  });

  it("status rejected'e (moderasyon) geçerken de temizler", () => {
    const data: Record<string, unknown> = { status: ProductStatus.rejected };
    clearStaleInactiveReasonOnWrite(data);
    expect(data.inactiveReason).toBeNull();
  });

  it("çağıran inactiveReason'ı AYNI yazımda zaten belirtmişse dokunmaz", () => {
    const data: Record<string, unknown> = {
      status: ProductStatus.inactive,
      inactiveReason: ProductInactiveReason.return_quarantine,
    };
    clearStaleInactiveReasonOnWrite(data);
    expect(data.inactiveReason).toBe(ProductInactiveReason.return_quarantine);
  });

  it("status inactive'e YAZILIYORSA dokunmaz (o yolun kendi kararı geçerli)", () => {
    const data: Record<string, unknown> = { status: ProductStatus.inactive };
    clearStaleInactiveReasonOnWrite(data);
    expect(data).not.toHaveProperty("inactiveReason");
  });

  it("yazım status'a hiç dokunmuyorsa (ör. yalnız quantity) hiçbir şey yapmaz", () => {
    const data: Record<string, unknown> = { quantity: { increment: 1 } };
    clearStaleInactiveReasonOnWrite(data);
    expect(data).not.toHaveProperty("inactiveReason");
  });

  it("data undefined ise güvenle no-op'tur", () => {
    expect(() => clearStaleInactiveReasonOnWrite(undefined)).not.toThrow();
  });
});
