import * as ExcelJS from "exceljs";

import { translateMessage } from "../../modules/i18n/translate";
import {
  EXPORT_COLUMN_WIDTH,
  buildExportWorkbook,
  maskExportValue,
  toCellValue,
  type Translate,
  type WorkbookColumn,
  type WorkbookInput,
} from "./xlsx-workbook";

const t: Translate = (key, values) => translateMessage(key, "tr", values);

const COLUMNS: WorkbookColumn[] = [
  { key: "title", header: "Başlık", type: "text" },
  { key: "amount", header: "Tutar", type: "money" },
  { key: "quantity", header: "Adet", type: "number" },
  { key: "day", header: "Gün", type: "date" },
  { key: "at", header: "An", type: "datetime" },
  { key: "active", header: "Aktif", type: "boolean" },
  { key: "status", header: "Durum", type: "status" },
  { key: "identity", header: "Kimlik", type: "text", masked: true },
];

function input(over: Partial<WorkbookInput> = {}): WorkbookInput {
  return {
    summary: {
      title: "Deneme Raporu",
      generatedAt: new Date("2026-10-12T21:30:00.000Z"),
      filters: [{ label: "Durum", value: "Serbest Bırakıldı" }],
      rowCount: 1,
    },
    sheets: [
      {
        name: "Veri",
        columns: COLUMNS,
        records: [
          {
            title: "=cmd",
            amount: -125.5,
            quantity: 3,
            day: "2026-08-04T21:30:00.000Z",
            at: new Date("2026-08-04T21:30:00.000Z"),
            active: true,
            status: "Tutuluyor",
            identity: "12345678901",
          },
        ],
      },
    ],
    t,
    unmask: false,
    ...over,
  };
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  return workbook;
}

const values = (row: ExcelJS.Row) => (row.values as unknown[]).slice(1);

describe("buildExportWorkbook — kitap şekli", () => {
  it("ilk sayfa Özet'tir, veri sayfası onu izler", async () => {
    const workbook = await load(await buildExportWorkbook(input()));
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Özet", "Veri"]);
  });

  it("Özet rapor adını, İstanbul saatiyle oluşturulma anını, kayıt sayısını ve filtreleri taşır", async () => {
    const workbook = await load(await buildExportWorkbook(input()));
    const summary = workbook.getWorksheet("Özet");
    const rows = (summary?.getSheetValues() ?? []).filter(Boolean) as unknown[][];
    const byLabel = new Map(rows.map((r) => [r[1], r[2]]));

    expect(byLabel.get("Rapor")).toBe("Deneme Raporu");
    // 21:30Z = ertesi gün 00:30 İstanbul.
    expect(byLabel.get("Oluşturulma (İstanbul saati)")).toEqual(
      new Date("2026-10-13T00:30:00.000Z"),
    );
    expect(byLabel.get("Kayıt sayısı")).toBe(1);
    expect(byLabel.get("Durum")).toBe("Serbest Bırakıldı");
  });

  it("filtre yoksa bunu açıkça yazar", async () => {
    const base = input();
    const workbook = await load(
      await buildExportWorkbook({
        ...base,
        summary: { ...base.summary, filters: [] },
      }),
    );
    const flat = JSON.stringify(workbook.getWorksheet("Özet")?.getSheetValues());
    expect(flat).toContain("Filtre yok — tüm kayıtlar");
  });

  it("uzun biçim satır sayısını, toplamları ve notları Özet'e yazar", async () => {
    const base = input();
    const workbook = await load(
      await buildExportWorkbook({
        ...base,
        summary: {
          ...base.summary,
          lineCount: 4,
          totals: [{ label: "Toplam", value: 1500.25, type: "money" }],
          notes: ["Dosya yalnız ilk 2 kaydı içeriyor"],
        },
      }),
    );
    const summary = workbook.getWorksheet("Özet");
    const rows = (summary?.getSheetValues() ?? []).filter(Boolean) as unknown[][];
    const byLabel = new Map(rows.map((r) => [r[1], r[2]]));

    expect(byLabel.get("Satır sayısı (kalem)")).toBe(4);
    expect(byLabel.get("Toplam")).toBe(1500.25);
    expect(byLabel.has("Dosya yalnız ilk 2 kaydı içeriyor")).toBe(true);

    let totalFmt: string | undefined;
    summary?.eachRow((row) => {
      if (row.getCell(1).value === "Toplam") totalFmt = row.getCell(2).numFmt;
    });
    expect(totalFmt).toBe("#,##0.00 ₺");
  });

  it("ek sayfalar veri sayfalarından sonra gelir", async () => {
    const workbook = await load(
      await buildExportWorkbook(
        input({
          appendix: [{ name: "Bilgi", rows: [{ label: "Dönem", value: "2026-09" }] }],
        }),
      ),
    );
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Özet",
      "Veri",
      "Bilgi",
    ]);
  });

  it("aynı adlı sayfalar çakışmaz; geçersiz karakterler ve uzunluk temizlenir", async () => {
    const workbook = await load(
      await buildExportWorkbook(
        input({
          sheets: [
            { name: "özet", columns: [], records: [] },
            { name: "A/B:C*D?E[F]G\\ çok uzun bir sayfa adı burada", columns: [], records: [] },
          ],
        }),
      ),
    );
    const names = workbook.worksheets.map((s) => s.name);
    expect(names[0]).toBe("Özet");
    expect(names[1]).toBe("özet (2)");
    expect(names[2]).toHaveLength(31);
    expect(names[2]).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe("buildExportWorkbook — veri sayfası", () => {
  async function dataSheet(over: Partial<WorkbookInput> = {}) {
    const workbook = await load(await buildExportWorkbook(input(over)));
    const sheet = workbook.getWorksheet("Veri");
    if (!sheet) throw new Error("veri sayfası yok");
    return sheet;
  }

  it("başlık satırı kalın, dondurulmuş ve otomatik filtreli", async () => {
    const sheet = await dataSheet();
    expect(values(sheet.getRow(1))).toEqual(COLUMNS.map((c) => c.header));
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("para SAYI hücresidir ve ₺ biçimi taşır; negatif tutar bozulmaz", async () => {
    const cell = (await dataSheet()).getRow(2).getCell(2);
    expect(cell.value).toBe(-125.5);
    expect(cell.numFmt).toBe("#,##0.00 ₺");
  });

  it("sayı sayıdır", async () => {
    expect((await dataSheet()).getRow(2).getCell(3).value).toBe(3);
  });

  it("tarihler gerçek tarih hücresidir, İstanbul duvar saatiyle", async () => {
    const row = (await dataSheet()).getRow(2);
    // 21:30Z = 5 Ağustos 00:30 İstanbul — ekranla aynı gün.
    expect(row.getCell(4).value).toEqual(new Date("2026-08-05T00:30:00.000Z"));
    expect(row.getCell(4).numFmt).toBe("dd.mm.yyyy");
    expect(row.getCell(5).value).toEqual(new Date("2026-08-05T00:30:00.000Z"));
    expect(row.getCell(5).numFmt).toBe("dd.mm.yyyy hh:mm");
  });

  it("evet/hayır çevrilir, durum etiketi olduğu gibi yazılır", async () => {
    const row = (await dataSheet()).getRow(2);
    expect(row.getCell(6).value).toBe("Evet");
    expect(row.getCell(7).value).toBe("Tutuluyor");
  });

  it("yalnız METİN formüle karşı nötrlenir", async () => {
    const row = (await dataSheet()).getRow(2);
    expect(row.getCell(1).value).toBe("'=cmd");
    expect(row.getCell(2).value).toBe(-125.5);
  });

  it("maskeli kolon yetki yoksa son dört haneyle yazılır, yetki varsa açık", async () => {
    expect((await dataSheet()).getRow(2).getCell(8).value).toBe("••••8901");
    expect((await dataSheet({ unmask: true })).getRow(2).getCell(8).value).toBe(
      "12345678901",
    );
  });

  it("kolon genişliği tipten gelir; başlık daha uzunsa başlık kazanır", async () => {
    const sheet = await dataSheet();
    expect(sheet.getColumn(2).width).toBe(EXPORT_COLUMN_WIDTH.money);
    expect(sheet.getColumn(3).width).toBe(EXPORT_COLUMN_WIDTH.number);
    expect(sheet.getColumn(1).width).toBe(EXPORT_COLUMN_WIDTH.text);
  });
});

describe("toCellValue", () => {
  it("boş değer boş hücredir", () => {
    expect(toCellValue(null, { type: "text" }, t)).toBeNull();
    expect(toCellValue(undefined, { type: "money" }, t)).toBeNull();
    expect(toCellValue("", { type: "date" }, t)).toBeNull();
  });

  it("çözülemeyen tarih metin olarak kalır (sessizce kaybolmaz)", () => {
    expect(toCellValue("bilinmiyor", { type: "date" }, t)).toBe("bilinmiyor");
  });

  it("sayı kolonunda metin gelirse nötrlenmiş metin yazılır", () => {
    expect(toCellValue("-5 TL", { type: "money" }, t)).toBe("'-5 TL");
  });

  it("hayır da çevrilir", () => {
    expect(toCellValue(false, { type: "boolean" }, t)).toBe("Hayır");
  });
});

describe("maskExportValue", () => {
  it("uzunluğu sızdırmaz", () => {
    expect(maskExportValue("TR12 0006 1000 0000 1234 5678 90")).toBe("••••7890");
    expect(maskExportValue("123")).toBe("••••");
  });
});
