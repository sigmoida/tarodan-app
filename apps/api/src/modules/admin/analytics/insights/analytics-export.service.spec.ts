import * as ExcelJS from "exceljs";
import type { AnalyticsSalesResponse } from "@tarodan/types";
import { ExportListService } from "../../../../common/export";
import { AnalyticsExportService } from "./analytics-export.service";

/** Yalnız çağrılan sekmenin servisi konuşur; diğerleri sessiz kalmalı. */
const silent = () => ({
  get: jest.fn(() => {
    throw new Error("wrong tab");
  }),
});

const response = {
  range: {
    // İstanbul gece yarısı: 1 Haziran 00:00 = 31 Mayıs 21:00Z.
    from: "2026-05-31T21:00:00.000Z",
    to: "2026-06-30T20:59:59.999Z",
    groupBy: "day",
    compared: false,
    previousFrom: null,
    previousTo: null,
    timeZone: "Europe/Istanbul",
  },
  metrics: {
    gmv: { current: 1250.5, previous: null, changePercent: -12.5 },
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
    { key: "c1", label: "Yılmaz, Ltd.", count: 3, amount: -1250.5, share: 100 },
  ],
  byBrand: [],
  topSellers: [{ id: "u1", label: "=cmd", orderCount: 3, gmv: 1250.5 }],
} as unknown as AnalyticsSalesResponse;

function serviceWithSales() {
  const sales = { get: jest.fn().mockResolvedValue(response) };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  return {
    sales,
    audit,
    service: new AnalyticsExportService(
      sales as never,
      silent() as never,
      silent() as never,
      silent() as never,
      silent() as never,
      new ExportListService(audit as never),
    ),
  };
}

async function workbookOf(body: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as never);
  return workbook;
}

const rowValues = (sheet: ExcelJS.Worksheet | undefined, n: number) =>
  ((sheet?.getRow(n).values as unknown[]) ?? []).slice(1);

describe("AnalyticsExportService", () => {
  /**
   * Dosya, ekranın gördüğü YANITIN kendisinden üretilir. Eski uçlar raporu bir
   * kez ekran, bir kez dosya için hesaplıyordu; iki hesabın ayrışması an
   * meselesiydi.
   */
  it("sekmenin kendi servisini çağırır ve aynı aralığı iletir", async () => {
    const { sales, service } = serviceWithSales();
    const query = { from: "2026-06-01", to: "2026-06-30" };

    await service.export("sales", query, "admin-1", "tr");

    expect(sales.get).toHaveBeenCalledWith(query);
  });

  it("Özet'in ardından metrikleri, serileri ve kırılımları ayrı sayfalara yazar", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", undefined, "admin-1", "tr");
    const workbook = await workbookOf(file.body);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Özet",
      "metrics",
      "series",
      "byCategory",
      "topSellers",
    ]);
    const metrics = workbook.getWorksheet("metrics");
    expect(rowValues(metrics, 1)).toEqual([
      "metric",
      "current",
      "previous",
      "changePercent",
    ]);
    // Seriler tek sayfada yan yana: kova başına bir satır.
    const series = workbook.getWorksheet("series");
    expect(rowValues(series, 1)).toEqual(["bucket", "gmv", "orderCount"]);
    expect(rowValues(series, 3)).toEqual(["2026-06-02", 1250.5, 3]);
  });

  it("boş kırılım için sayfa açmaz", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", undefined, "admin-1", "tr");
    const workbook = await workbookOf(file.body);

    expect(workbook.getWorksheet("byBrand")).toBeUndefined();
  });

  /** Eski CSV negatif değerleri `'-12.5` metnine çeviriyordu — toplanamıyordu. */
  it("sayılar — negatifler dahil — SAYI hücresidir", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", undefined, "admin-1", "tr");
    const workbook = await workbookOf(file.body);

    const gmv = workbook.getWorksheet("metrics")?.getRow(2);
    expect(gmv?.getCell(1).value).toBe("gmv");
    expect(gmv?.getCell(2).value).toBe(1250.5);
    expect(gmv?.getCell(4).value).toBe(-12.5);
    expect(rowValues(workbook.getWorksheet("byCategory"), 2)).toContain(
      -1250.5,
    );
  });

  it("metinler formüle karşı nötrlenir, virgül olduğu gibi kalır", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", undefined, "admin-1", "tr");
    const workbook = await workbookOf(file.body);

    expect(rowValues(workbook.getWorksheet("topSellers"), 2)).toContain("'=cmd");
    expect(rowValues(workbook.getWorksheet("byCategory"), 2)).toContain(
      "Yılmaz, Ltd.",
    );
  });

  it("aralığı İstanbul takvimiyle dosya adına taşır", async () => {
    const { service } = serviceWithSales();
    const file = await service.export("sales", undefined, "admin-1", "tr");

    expect(file.filename).toMatch(
      /^analitik-sales-2026-06-01-2026-06-30-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it("her indirme denetim kaydı bırakır", async () => {
    const { service, audit } = serviceWithSales();
    await service.export(
      "sales",
      { from: "2026-06-01", to: "2026-06-30" },
      "admin-1",
      "tr",
    );

    const [actor, action, entityType, entityId, , payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType, entityId]).toEqual([
      "admin-1",
      "analytics_export",
      "Analytics",
      "sales",
    ]);
    expect(payload.filters).toMatchObject({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });
});
