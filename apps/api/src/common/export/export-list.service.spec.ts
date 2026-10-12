import * as ExcelJS from "exceljs";
import { defineExportCatalog } from "@tarodan/types";

import {
  ExportListService,
  auditFilters,
  collectRows,
  type ExportPageRequest,
} from "./export-list.service";

const catalog = defineExportCatalog("demo", [
  { key: "name", labelKey: "common.name", type: "text" },
  { key: "amount", labelKey: "common.amount", type: "money" },
]);

interface Row {
  id: number;
  name: string;
  amount: number;
  lines?: number[];
}

const makeRows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `Satır ${i}`,
    amount: i,
  }));

/** Gerçek bir listeyi taklit eder: skip/take ile sayfa döner. */
function pagedSource(rows: Row[]) {
  return jest.fn(async ({ skip, take }: ExportPageRequest) =>
    rows.slice(skip, skip + take),
  );
}

function setup() {
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ExportListService(audit as never);
  return { service, audit };
}

const baseOptions = {
  locale: "tr" as const,
  slug: "demo",
  titleKey: "server.export.summary.report",
  map: (row: Row) => ({ name: row.name, amount: row.amount }),
};

async function sheetsOf(body: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(body as never);
  return workbook.worksheets;
}

describe("collectRows", () => {
  it("listeyi skip/take sayfalarıyla sonuna kadar okur", async () => {
    const fetchPage = pagedSource(makeRows(7));
    const rows = await collectRows(fetchPage, 100, 3);
    expect(rows).toHaveLength(7);
    expect(fetchPage.mock.calls.map(([p]) => p)).toEqual([
      { page: 1, skip: 0, take: 3 },
      { page: 2, skip: 3, take: 3 },
      { page: 3, skip: 6, take: 3 },
    ]);
  });

  it("tavanı bir kayıt aşınca durur — fazlası kırpılma kanıtıdır", async () => {
    const fetchPage = pagedSource(makeRows(100));
    const rows = await collectRows(fetchPage, 5, 3);
    expect(rows.length).toBeGreaterThan(5);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("tavan tam dolduğunda bir sonraki sayfayı da sorar (boşsa kırpılma yok)", async () => {
    const fetchPage = pagedSource(makeRows(6));
    const rows = await collectRows(fetchPage, 6, 3);
    expect(rows).toHaveLength(6);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});

describe("ExportListService.exportList", () => {
  it("tavanı aşmayan dökümde kırpılma yoktur", async () => {
    const { service } = setup();
    const file = await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource(makeRows(4)),
      pageSize: 2,
      audit: { actorId: "a1", action: "demo_export", entityType: "Demo", query: {} },
    });
    expect(file.rowCount).toBe(4);
    expect(file.truncatedAt).toBeNull();
    expect(file.filename).toMatch(/^demo-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("tavan aşılırsa ilk N kaydı yazar ve tavanı bildirir", async () => {
    const { service, audit } = setup();
    const file = await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource(makeRows(10)),
      cap: 3,
      pageSize: 2,
      audit: { actorId: "a1", action: "demo_export", entityType: "Demo", query: {} },
    });

    expect(file).toMatchObject({ rowCount: 3, truncatedAt: 3 });
    const [summary, data] = await sheetsOf(file.body);
    expect(data.rowCount).toBe(1 + 3);
    expect(JSON.stringify(summary.getSheetValues())).toContain("ilk 3 kaydı");
    expect(audit.createRequiredAuditLog.mock.calls[0][5]).toMatchObject({
      rowCount: 3,
      truncated: true,
      truncatedAt: 3,
    });
  });

  it("veri sayfası katalog sırasıyla, katalog başlıklarıyla yazılır", async () => {
    const { service } = setup();
    const file = await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource(makeRows(1)),
      audit: { actorId: "a1", action: "demo_export", entityType: "Demo", query: {} },
    });
    const [summary, data] = await sheetsOf(file.body);
    expect(summary.name).toBe("Özet");
    expect((data.getRow(1).values as unknown[]).slice(1)).toEqual([
      "İsim",
      "Tutar",
    ]);
    expect((data.getRow(2).values as unknown[]).slice(1)).toEqual([
      "Satır 0",
      0,
    ]);
  });

  it("uzun biçim: bir kayıt birden çok satır; Özet kalem sayısını ve notu taşır", async () => {
    const { service, audit } = setup();
    const rows: Row[] = [
      { id: 1, name: "GRP-1", amount: 300, lines: [100, 200] },
      { id: 2, name: "ORD-2", amount: 50, lines: [50] },
    ];
    const file = await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource(rows),
      map: (row: Row) =>
        (row.lines ?? []).map((amount) => ({ name: row.name, amount })),
      longFormat: true,
      totals: (kept) => [
        {
          labelKey: "server.export.summary.parentTotal",
          value: kept.reduce((sum, r) => sum + r.amount, 0),
          type: "money",
        },
      ],
      audit: { actorId: "a1", action: "demo_export", entityType: "Demo", query: {} },
    });

    expect(file.rowCount).toBe(2);
    const [summary, data] = await sheetsOf(file.body);
    expect(data.rowCount).toBe(1 + 3);
    // Üst kaydın kolonu her kalemde tekrarlanır.
    expect(data.getRow(2).getCell(1).value).toBe("GRP-1");
    expect(data.getRow(3).getCell(1).value).toBe("GRP-1");
    const flat = JSON.stringify(summary.getSheetValues());
    expect(flat).toContain("Satır sayısı (kalem)");
    expect(flat).toContain("Kayıt tutarları toplamı");
    expect(flat).toContain("toplamayın");
    expect(audit.createRequiredAuditLog.mock.calls[0][5]).toMatchObject({
      rowCount: 2,
      lineCount: 3,
    });
  });

  it("denetim kaydına arama TERİMİ yazılmaz; yalnız uygulandığı ve uzunluğu", async () => {
    const { service, audit } = setup();
    await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource([]),
      audit: {
        actorId: "admin-1",
        action: "demo_export",
        entityType: "Demo",
        query: {
          search: " 12345678901 ",
          status: "held",
          page: 3,
          limit: 50,
        },
      },
    });

    const [actor, action, entityType, entityId, oldValue, payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType, entityId, oldValue]).toEqual([
      "admin-1",
      "demo_export",
      "Demo",
      "export",
      null,
    ]);
    expect(JSON.stringify(payload)).not.toContain("12345678901");
    expect(payload).toEqual({
      resource: "demo",
      filters: { status: "held", searchApplied: true, searchLength: 11 },
      rowCount: 0,
      truncated: false,
      truncatedAt: null,
    });
  });

  it("Özet arama terimini de yazmaz", async () => {
    const { service } = setup();
    const file = await service.exportList({
      ...baseOptions,
      catalog,
      fetchPage: pagedSource([]),
      audit: {
        actorId: "a1",
        action: "demo_export",
        entityType: "Demo",
        query: { search: "ahmet@ornek.com" },
      },
    });
    const [summary] = await sheetsOf(file.body);
    const flat = JSON.stringify(summary.getSheetValues());
    expect(flat).not.toContain("ahmet@ornek.com");
    expect(flat).toContain("Uygulandı (15 karakter)");
  });

  it("denetim yazılamazsa dosya dönmez (fail-closed)", async () => {
    const { service, audit } = setup();
    audit.createRequiredAuditLog.mockRejectedValue(new Error("audit down"));
    await expect(
      service.exportList({
        ...baseOptions,
        catalog,
        fetchPage: pagedSource(makeRows(1)),
        audit: { actorId: "a1", action: "demo_export", entityType: "Demo", query: {} },
      }),
    ).rejects.toThrow("audit down");
  });
});

describe("auditFilters", () => {
  it("redakte edilen ek anahtarlar da terim olarak yazılmaz", () => {
    expect(
      auditFilters({
        actorId: "a",
        action: "x",
        entityType: "X",
        query: { party: "Ahmet Kaya", orderNumber: "ORD-1", search: "" },
        redact: ["party"],
      }),
    ).toEqual({
      orderNumber: "ORD-1",
      searchApplied: false,
      searchLength: 0,
      partyApplied: true,
      partyLength: 10,
    });
  });
});

describe("ExportListService.exportSheets", () => {
  it("hazır sayfaları Özet'in arkasına yazar ve denetim bırakır", async () => {
    const { service, audit } = setup();
    const file = await service.exportSheets({
      locale: "tr",
      slug: "analitik-sales",
      titleKey: "server.export.summary.report",
      rowCount: 2,
      sheets: () => [
        {
          name: "metrics",
          columns: [{ key: "metric", header: "metric", type: "text" }],
          records: [{ metric: "gmv" }, { metric: "orderCount" }],
        },
      ],
      audit: {
        actorId: "a1",
        action: "analytics_export",
        entityType: "Analytics",
        query: { from: "2026-06-01" },
      },
    });
    const sheets = await sheetsOf(file.body);
    expect(sheets.map((s) => s.name)).toEqual(["Özet", "metrics"]);
    expect(file.truncatedAt).toBeNull();
    expect(audit.createRequiredAuditLog).toHaveBeenCalledTimes(1);
  });
});
