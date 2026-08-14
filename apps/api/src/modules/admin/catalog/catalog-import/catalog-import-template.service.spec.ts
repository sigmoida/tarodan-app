import * as ExcelJS from "exceljs";
import { CatalogImportTemplateService } from "./catalog-import-template.service";
import { CatalogImportService } from "./catalog-import.service";
import { CATALOG_IMPORT_SPECS } from "./catalog-import.specs";
import {
  CATALOG_IMPORT_RESOURCES,
  type CatalogImportResource,
} from "./catalog-import.types";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function asUpload(buffer: Buffer): Express.Multer.File {
  return {
    fieldname: "workbook",
    originalname: "sablon.xlsx",
    encoding: "7bit",
    mimetype: XLSX_MIME,
    size: buffer.byteLength,
    buffer,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never,
  };
}

describe("CatalogImportTemplateService", () => {
  let templates: CatalogImportTemplateService;

  beforeEach(() => {
    templates = new CatalogImportTemplateService();
  });

  it.each([...CATALOG_IMPORT_RESOURCES])(
    "%s şablonunun başlıkları kolon tanımıyla birebir aynı",
    async (resource) => {
      const spec = CATALOG_IMPORT_SPECS[resource];
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await templates.build(resource)) as unknown as ExcelJS.Buffer,
      );

      const sheet = workbook.getWorksheet(spec.sheetName)!;
      expect(sheet).toBeDefined();
      const headers = (sheet.getRow(1).values as unknown[])
        .slice(1)
        .map(String);
      expect(headers).toEqual(spec.columns.map((column) => column.key));
    },
  );

  it("kolonların anlamını taşıyan Aciklama sayfası ekler", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      (await templates.build("brands")) as unknown as ExcelJS.Buffer,
    );

    expect(workbook.getWorksheet("Aciklama")).toBeDefined();
  });

  it("aynı kaynağı yeniden üretmez, önbellekten döner", async () => {
    const first = await templates.build("brands");
    const second = await templates.build("brands");

    expect(second).toBe(first);
  });

  it.each([...CATALOG_IMPORT_RESOURCES])(
    "%s şablonu doldurulmadan bile ayrıştırıcıdan geçer",
    async (resource: CatalogImportResource) => {
      // Round-trip: şablon ile ayrıştırıcı ayrışırsa kullanıcı, indirdiği
      // dosyayı olduğu gibi yüklediğinde "sütunlar eksik" hatası alırdı.
      const prisma = {
        brand: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: "b1", name: "Dodge", slug: "dodge", isActive: true },
            ]),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        manufacturer: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        carModel: {
          findMany: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: jest.fn(),
      };
      // `$transaction` tx olarak yine bu nesneyi verir. Bağlama, nesne
      // kurulduktan SONRA yapılır: başlatıcının içinden `prisma`ya atıf,
      // tipin kendi çıkarımına dayanması demek olurdu (TS7022).
      prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) =>
        Promise.resolve(fn(prisma)),
      );
      const service = new CatalogImportService(
        prisma as any,
        { delPattern: jest.fn().mockResolvedValue(0) } as any,
        { createAuditLog: jest.fn().mockResolvedValue(undefined) } as any,
      );

      // Araç modeli şablonundaki örnek marka ("Dodge") mock'ta mevcut.
      const result = await service.import(
        "admin-1",
        resource,
        asUpload(await templates.build(resource)),
      );

      expect(result.createdCount).toBe(1);
    },
  );
});
