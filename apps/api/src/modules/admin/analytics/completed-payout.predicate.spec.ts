import { PayoutStatus } from "@prisma/client";
import {
  completedPayoutAmountSql,
  completedPayoutWhere,
} from "./completed-payout.predicate";

const window = {
  gte: new Date("2026-06-01T00:00:00.000Z"),
  lte: new Date("2026-06-30T23:59:59.999Z"),
};

/**
 * Yüklem iki dilde yazılı (Prisma filtresi + ham SQL) çünkü `submittedAmount`
 * ile `netAmount` arasındaki satır-bazlı seçim aggregate API'de ifade
 * edilemiyor. Bu spec ikisinin AYNI üç kuralı taşıdığını sabitler.
 */
describe("tamamlanmış payout yüklemi", () => {
  describe("completedPayoutWhere (Prisma)", () => {
    it("yalnız tamamlanmış payout'ları sayar", () => {
      expect(completedPayoutWhere(window).status).toBe(PayoutStatus.completed);
    });

    it("dönemi processedAt'ten okur", () => {
      expect(completedPayoutWhere(window).processedAt).toEqual(window);
    });

    /** Pencere verilmediğinde tarih filtresi düşer, damga varlığı aranır. */
    it("penceresiz çağrıda 'damga var' koşuluna düşer", () => {
      expect(completedPayoutWhere(undefined).processedAt).toEqual({
        not: null,
      });
    });
  });

  describe("completedPayoutAmountSql (SQL)", () => {
    it("yalnız tamamlanmış payout'ları toplar", () => {
      const sql = completedPayoutAmountSql(window);
      expect(sql.sql).toContain('pt."status" =');
      expect(sql.values).toContain(PayoutStatus.completed);
    });

    it("gerçekten gönderilen tutarı COALESCE ile seçer", () => {
      const sql = completedPayoutAmountSql(window);
      expect(sql.sql).toContain(
        'COALESCE(pt."submitted_amount", pt."net_amount")',
      );
    });

    it("dönemi processedAt'ten okur", () => {
      const sql = completedPayoutAmountSql(window);
      expect(sql.sql).toContain('pt."processed_at" BETWEEN');
      expect(sql.values).toContain(window.gte);
      expect(sql.values).toContain(window.lte);
    });

    /** Pencere verilmediğinde tarih filtresi düşer, damga varlığı aranır. */
    it("penceresiz çağrıda 'damga var' koşuluna düşer", () => {
      const sql = completedPayoutAmountSql(undefined);
      expect(sql.sql).toContain('pt."processed_at" IS NOT NULL');
      expect(sql.values).not.toContain(window.gte);
    });
  });
});
