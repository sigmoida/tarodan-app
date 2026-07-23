import { ReservationReconciliationService } from "./reservation-reconciliation.service";
import { ProductStatus } from "@prisma/client";

/**
 * #2 (lost-update): reconcileReservedQuantities, `held`'i ürünü FOR UPDATE ile
 * kilitledikten SONRA, aynı transaction içinde hesaplamalı. Aksi halde tx dışında
 * hesaplanan bayat `held`, araya giren bir checkout rezervasyonunu mutlak yazımla siler.
 * Bu test kilidin aggregate'lerden ÖNCE alındığını ve aggregate'lerin tx üzerinde
 * çalıştığını doğrular.
 */
describe("ReservationReconciliationService.reconcileReservedQuantities — kilit sırası (#2)", () => {
  it("FOR UPDATE, aggregate'lerden ÖNCE alınır ve aggregate'ler tx üzerinde çalışır", async () => {
    const callOrder: string[] = [];
    const tx = {
      $queryRaw: jest.fn().mockImplementation(() => {
        callOrder.push("FOR_UPDATE");
        return Promise.resolve([]);
      }),
      order: {
        aggregate: jest.fn().mockImplementation(() => {
          callOrder.push("ORDER_AGG");
          return Promise.resolve({ _sum: { quantity: 0 } });
        }),
      },
      tradeItem: {
        aggregate: jest.fn().mockImplementation(() => {
          callOrder.push("TRADE_AGG");
          return Promise.resolve({ _sum: { quantity: 0 } });
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({
          reservedQuantity: 3, // held(0) != 3 → güncellemeye devam eder
          quantity: 5,
          status: ProductStatus.active,
        }),
        update: jest.fn().mockImplementation(() => {
          callOrder.push("UPDATE");
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: "p1" }]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      tradeItem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(undefined),
    } as any;
    const config = { get: jest.fn().mockReturnValue("5") } as any;
    const notifications = {} as any;
    const svc = new ReservationReconciliationService(
      prisma,
      cache,
      config,
      notifications,
    );

    await svc.reconcileReservedQuantities();

    // FOR UPDATE ilk; her iki aggregate ve UPDATE ondan sonra.
    expect(callOrder[0]).toBe("FOR_UPDATE");
    const forUpdateIdx = callOrder.indexOf("FOR_UPDATE");
    expect(callOrder.indexOf("ORDER_AGG")).toBeGreaterThan(forUpdateIdx);
    expect(callOrder.indexOf("TRADE_AGG")).toBeGreaterThan(forUpdateIdx);
    expect(callOrder.indexOf("UPDATE")).toBeGreaterThan(
      callOrder.indexOf("TRADE_AGG"),
    );
    // aggregate'ler tx üzerinde çalıştı (this.prisma değil)
    expect(tx.order.aggregate).toHaveBeenCalled();
    expect(tx.tradeItem.aggregate).toHaveBeenCalled();
  });
});
