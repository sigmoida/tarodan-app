import { SettlementReportService } from "./settlement-report.service";

/**
 * Dökümün SORGUSU faturanın kapsamını belirler: dönemin son günü düşerse o
 * günün teslimatları hiç faturalanmamış gibi görünür, arama ekranla dosyayı
 * ayrıştırırsa müşavire başka bir küme gider.
 */

type Captured = { where?: any; orderBy?: any; take?: number };

function serviceWith(captured: Captured) {
  const prisma = {
    order: {
      findMany: jest.fn(async (args: Captured) => {
        Object.assign(captured, args);
        return [];
      }),
      count: jest.fn(async () => 0),
    },
    paymentHold: { findMany: jest.fn(async () => []) },
  };
  return new SettlementReportService(prisma as never);
}

describe("SettlementReportService — dönem/arama/sıralama", () => {
  it("bitiş günü GÜN SONUNA genişler — son günün teslimatı düşmez", async () => {
    const captured: Captured = {};
    await serviceWith(captured).rows({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    } as never);

    const end: Date = captured.where.deliveredAt.lte;
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(captured.where.deliveredAt.gte).toEqual(new Date("2026-08-01"));
  });

  it("dönem yokken yalnız teslim edilmiş siparişleri alır", async () => {
    const captured: Captured = {};
    await serviceWith(captured).rows({} as never);
    expect(captured.where.deliveredAt).toEqual({ not: null });
  });

  it("ekrandaki KYT- kodu aranınca gövdesiyle koliyi bulur", async () => {
    const captured: Captured = {};
    await serviceWith(captured).rows({ search: "KYT-K7X9M2QF3N" } as never);

    const paths = captured.where.OR.map((clause: any) =>
      JSON.stringify(clause),
    );
    expect(paths.join()).toContain("K7X9M2QF3N");
    expect(paths.join()).not.toContain("KYT-");
    expect(captured.where.OR.some((c: any) => c.package?.packageNumber)).toBe(
      true,
    );
  });

  it("kayıt no'ya göre sıralama koli numarasına düşer", async () => {
    const captured: Captured = {};
    await serviceWith(captured).rows({
      sortBy: "recordNo",
      sortOrder: "asc",
    } as never);
    expect(captured.orderBy).toEqual({ package: { packageNumber: "asc" } });
  });

  it("bilinmeyen sıralama anahtarı teslimat tarihine düşer", async () => {
    const captured: Captured = {};
    await serviceWith(captured).rows({ sortBy: "yok" } as never);
    expect(captured.orderBy).toEqual({ deliveredAt: "desc" });
  });
});
