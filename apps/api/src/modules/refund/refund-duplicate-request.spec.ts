import { ACTIVE_REFUND_REQUEST_STATUSES } from "./refund-active-statuses";

/**
 * HIGH: "zaten aktif talep var" kontrolü read-then-create biçimindeydi ve
 * (orderId, aktif-durum) üzerinde DB tekilliği yoktu. İki sekmeden eşzamanlı
 * gönderim iki talep yaratıyor, ikisi de hold'u donduruyor ve 10 dakikalık cron
 * İKİ Sürat iade kargosu açıyordu. İkinci talebin finalize'ı kümülatif iade
 * tavanıyla kalıcı olarak bloklanıp sonsuz retry gürültüsü üretiyor ve admin
 * müdahalesi gerektiriyordu.
 *
 * Kısmi tekil indeks (aktif durumlar) tek doğru koruma; uygulama katmanı ihlali
 * anlamlı bir hataya çevirmeli.
 */
describe("aktif iade talebi durum listesi", () => {
  it("parayı bağlayan tüm durumları kapsar", () => {
    expect(ACTIVE_REFUND_REQUEST_STATUSES).toEqual(
      expect.arrayContaining([
        "pending_review",
        "approved",
        "wait_for_delivery",
        "return_shipment_open",
        "return_in_transit",
        "return_delivered",
        "disputed",
      ]),
    );
  });

  it("terminal durumları KAPSAMAZ (yeni talep açılabilmeli)", () => {
    expect(ACTIVE_REFUND_REQUEST_STATUSES).not.toContain("refunded");
    expect(ACTIVE_REFUND_REQUEST_STATUSES).not.toContain("rejected");
    expect(ACTIVE_REFUND_REQUEST_STATUSES).not.toContain("cancelled");
  });

  it("migration'daki kısmi indeks ile birebir aynı durum kümesini kullanır", () => {
    // Kod ile SQL ayrışırsa yarış yeniden açılır; bu yüzden migration dosyası
    // burada okunup karşılaştırılır.
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../../prisma/migrations/20260730140000_unique_active_refund_request_per_order/migration.sql",
      ),
      "utf8",
    );
    for (const status of ACTIVE_REFUND_REQUEST_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).not.toContain("'refunded'");
    expect(sql).not.toContain("'rejected'");
    expect(sql).not.toContain("'cancelled'");
  });
});
