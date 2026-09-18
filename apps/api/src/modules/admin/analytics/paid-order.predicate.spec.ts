import { OrderOrigin, PaymentStatus } from "@prisma/client";
import { paidAtLateral, paidOrderWhere, paidOrdersCte } from "./paid-order.predicate";

const window = {
  gte: new Date("2026-06-01T00:00:00.000Z"),
  lte: new Date("2026-06-30T23:59:59.999Z"),
};

/**
 * Yüklem iki dilde yazılı (Prisma filtresi + SQL CTE) çünkü zaman kovaları
 * SQL'de kesiliyor. Bu spec ikisinin AYNI üç kuralı taşıdığını sabitler;
 * ayrıştıkları gün dashboard ile analitik farklı ciro gösterirdi.
 */
describe("ödenmiş sipariş yüklemi", () => {
  describe("paidOrderWhere (Prisma)", () => {
    it("sanal siparişleri dışlar", () => {
      expect(paidOrderWhere(window).origin).toEqual({
        not: OrderOrigin.platform_service,
      });
    });

    it("ödemeyi HEM siparişte HEM grup sepetinde arar", () => {
      const where = paidOrderWhere(window);
      expect(where.OR).toHaveLength(2);
      expect(JSON.stringify(where.OR)).toContain("checkoutGroup");
    });

    it("dönemi ödeme ANINDAN okur", () => {
      expect(JSON.stringify(paidOrderWhere(window))).toContain("paidAt");
      expect(JSON.stringify(paidOrderWhere(window))).not.toContain("createdAt");
    });

    /** Pencere verilmediğinde tarih filtresi düşer → tüm zamanlar. */
    it("penceresiz çağrıda tarih filtresi uygulamaz", () => {
      const paid = (paidOrderWhere(undefined).OR as Array<Record<string, any>>)[0];
      expect(paid.payment.is.paidAt).toBeUndefined();
    });
  });

  describe("paidOrdersCte (SQL)", () => {
    const cte = paidOrdersCte(window);

    it("sanal siparişleri dışlar", () => {
      expect(cte.sql).toContain('o."origin" <>');
      expect(cte.values).toContain(OrderOrigin.platform_service);
    });

    it("ödemeyi HEM siparişte HEM grup sepetinde arar", () => {
      expect(cte.sql).toContain('pay."order_id" = "o"."id"');
      expect(cte.sql).toContain('pay."checkout_group_id" = "o"."checkout_group_id"');
    });

    it("dönemi ödeme ANINDAN okur", () => {
      expect(cte.sql).toContain('paid."paid_at" >=');
      expect(cte.values).toContain(window.gte);
      expect(cte.values).toContain(window.lte);
    });

    it("yalnız tamamlanmış ödemeyi sayar", () => {
      expect(cte.values).toContain(PaymentStatus.completed);
    });

    /**
     * İki ödeme yolu `OR` ile yazılsaydı aynı sipariş iki ödeme satırıyla
     * eşleşip ciroyu ikiye katlayabilirdi; LATERAL + LIMIT 1 tek satıra iner.
     */
    it("iki ödeme yolunu tek satıra indirir", () => {
      expect(cte.sql).toContain("JOIN LATERAL");
      expect(cte.sql).toContain("LIMIT 1");
    });
  });

  describe("paidAtLateral", () => {
    it("verilen takma ada bağlanır", () => {
      expect(paidAtLateral("ord").sql).toContain('pay."order_id" = "ord"."id"');
    });
  });
});
