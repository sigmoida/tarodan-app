import type { AnalyticsSalesResponse } from "@tarodan/types";
import { AnalyticsExportService } from "./analytics-export.service";

/** Yalnız çağrılan sekmenin servisi konuşur; diğerleri sessiz kalmalı. */
const silent = () => ({
  get: jest.fn(() => {
    throw new Error("wrong tab");
  }),
});

const response = {
  range: {
    from: "2026-06-01T00:00:00.000Z",
    to: "2026-06-30T20:59:59.999Z",
    groupBy: "day",
    compared: false,
    previousFrom: null,
    previousTo: null,
    timeZone: "Europe/Istanbul",
  },
  metrics: {
    gmv: { current: 1250.5, previous: null, changePercent: null },
    orderCount: { current: 3, previous: null, changePercent: null },
  },
  series: [
    {
      key: "gmv",
      points: [
        { bucket: "2026-06-01", value: 0 },
        { bucket: "2026-06-02", value: 1250.5 },
      ],
    },
    {
      key: "orderCount",
      points: [
        { bucket: "2026-06-01", value: 0 },
        { bucket: "2026-06-02", value: 3 },
      ],
    },
  ],
  byCategory: [
    { key: "c1", label: "Yılmaz, Ltd.", count: 3, amount: 1250.5, share: 100 },
  ],
  byBrand: [],
  topSellers: [{ id: "u1", label: "=cmd", orderCount: 3, gmv: 1250.5 }],
} as unknown as AnalyticsSalesResponse;

function serviceWithSales() {
  const sales = { get: jest.fn().mockResolvedValue(response) };
  return {
    sales,
    service: new AnalyticsExportService(
      sales as never,
      silent() as never,
      silent() as never,
      silent() as never,
      silent() as never,
    ),
  };
}

describe("AnalyticsExportService", () => {
  /**
   * Dosya, ekranın gördüğü YANITIN kendisinden üretilir. Eski uçlar raporu bir
   * kez ekran, bir kez dosya için hesaplıyordu; iki hesabın ayrışması an
   * meselesiydi.
   */
  it("sekmenin kendi servisini çağırır ve aynı aralığı iletir", async () => {
    const { sales, service } = serviceWithSales();
    const query = { from: "2026-06-01", to: "2026-06-30" };

    await service.export("sales", "csv", query);

    expect(sales.get).toHaveBeenCalledWith(query);
  });

  it("metrikleri, serileri ve kırılımları ayrı sayfalara yazar", async () => {
    const { service } = serviceWithSales();
    const csv = (await service.export("sales", "csv", undefined)).body.toString(
      "utf8",
    );

    expect(csv).toContain("metrics");
    expect(csv).toContain("metric,current,previous,changePercent");
    expect(csv).toContain("gmv,1250.5,,");
    // Seriler tek sayfada yan yana: kova başına bir satır.
    expect(csv).toContain("bucket,gmv,orderCount");
    expect(csv).toContain("2026-06-02,1250.5,3");
    expect(csv).toContain("byCategory");
  });

  it("boş kırılım için sayfa açmaz", async () => {
    const { service } = serviceWithSales();
    const csv = (await service.export("sales", "csv", undefined)).body.toString(
      "utf8",
    );

    expect(csv).not.toContain("byBrand");
  });

  it("aralığı dosya adına taşır", async () => {
    const { service } = serviceWithSales();

    expect((await service.export("sales", "csv", undefined)).filename).toBe(
      "analitik-sales-2026-06-01-2026-06-30.csv",
    );
    expect((await service.export("sales", "xlsx", undefined)).filename).toBe(
      "analitik-sales-2026-06-01-2026-06-30.xlsx",
    );
  });

  it("paylaşılan yazıcıdan geçtiği için kaçış ve formül korumasını devralır", async () => {
    const { service } = serviceWithSales();
    const csv = (await service.export("sales", "csv", undefined)).body.toString(
      "utf8",
    );

    expect(csv).toContain('"Yılmaz, Ltd."');
    expect(csv).toContain("'=cmd");
  });

  it("XLSX'i elektronik tablo içerik tipiyle döner", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", "xlsx", undefined);

    expect(file.contentType).toContain("spreadsheetml.sheet");
    expect(file.body.length).toBeGreaterThan(0);
  });
});
