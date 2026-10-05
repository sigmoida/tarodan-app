import { ProductInactiveReason, ProductStatus } from "@prisma/client";
import {
  clearStaleInactiveReasonOnWrite,
  shouldQuarantineReturnedStock,
  statusAfterStockRestore,
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

  it.each([
    ["yenileme (active)", ProductStatus.active],
    ["yenileme/yeniden açma (pending)", ProductStatus.pending],
    ["yönetici onayı sonrası silme (deleted)", ProductStatus.deleted],
  ])(
    "süresi dolmuş (expired) ilan %s ile inactive'den çıkınca işaret temizlenir",
    (_label, status) => {
      // Bayat `expired` işareti ilerideki bir pasife almada yenileme kısayolunu
      // yanlış ilana sızdırırdı.
      const data: Record<string, unknown> = { status };
      clearStaleInactiveReasonOnWrite(data);
      expect(data.inactiveReason).toBeNull();
    },
  );

  it("süre dolumu yazımı (inactive + expired) işaretini korur", () => {
    const data: Record<string, unknown> = {
      status: ProductStatus.inactive,
      inactiveReason: ProductInactiveReason.expired,
    };
    clearStaleInactiveReasonOnWrite(data);
    expect(data.inactiveReason).toBe(ProductInactiveReason.expired);
  });

  it("yenileme yazımı (status + publishedAt, neden belirtilmemiş) nedeni null yapar", () => {
    const data: Record<string, unknown> = {
      status: ProductStatus.active,
      publishedAt: new Date(),
    };
    clearStaleInactiveReasonOnWrite(data);
    expect(data.inactiveReason).toBeNull();
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

describe("statusAfterStockRestore", () => {
  const live = { status: ProductStatus.active, inactiveReason: null };
  const quarantined = {
    status: ProductStatus.inactive,
    inactiveReason: ProductInactiveReason.return_quarantine,
  };

  it("teslim sonrası iade karantinaya alır", () => {
    expect(statusAfterStockRestore(live, 5, true)).toEqual(quarantined);
  });

  it("karantinadaki ilan teslimat öncesi iptalle satışa açılmaz", () => {
    expect(statusAfterStockRestore(quarantined, 5, false)).toEqual(quarantined);
  });

  it("karantinada değilse durum miktardan gelir", () => {
    expect(statusAfterStockRestore(live, 1, false)).toEqual({
      status: ProductStatus.active,
      inactiveReason: null,
    });
    expect(
      statusAfterStockRestore(
        { status: ProductStatus.inactive, inactiveReason: null },
        0,
        false,
      ),
    ).toEqual({ status: ProductStatus.inactive, inactiveReason: null });
  });
});
