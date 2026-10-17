import * as ExcelJS from "exceljs";
import { BusinessStatus } from "@prisma/client";
import { ExportListService } from "../../../../common/export";
import { AdminGibReportService, toGibRow } from "./admin-gib-report.service";

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  productCode: "U010001",
  title: '=HYPERLINK("x") Hot Wheels',
  description: "Nadir parça",
  price: "149.90",
  status: "active",
  publishedAt: new Date("2026-02-01T09:00:00Z"),
  createdAt: new Date("2026-01-30T09:00:00Z"),
  seller: {
    id: "u1",
    username: "ahmet_k",
    displayName: "ahmetcik",
    companyName: null,
    taxId: null,
    businessStatus: null,
    createdAt: new Date("2025-03-01T10:00:00Z"),
    deletedAt: null,
    bankAccount: {
      accountHolder: "Ahmet Kaya",
      tcKimlikNo: "12345678901",
      taxId: null,
    },
    addresses: [],
    deletedIdentity: null,
  },
  ...over,
});

interface FindManyArgs {
  where: Record<string, unknown>;
  orderBy: unknown[];
  skip?: number;
  take?: number;
}

function makeService(rows: Record<string, unknown>[] = [product()]) {
  const prisma = {
    product: {
      // Gerçek tablo gibi skip/take ile dilimler — döküm sayfa döngüsü sonlanır.
      findMany: jest.fn(async (args: FindManyArgs) =>
        args.take === undefined
          ? rows
          : rows.slice(args.skip ?? 0, (args.skip ?? 0) + args.take),
      ),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminGibReportService(
      prisma as never,
      new ExportListService(audit as never),
    ),
    prisma,
    audit,
  };
}

describe("toGibRow", () => {
  it("ilan ve satıcı alanlarını kanonik herkese açık adreslerle eşler", () => {
    const row = toGibRow(product() as never);
    expect(row).toMatchObject({
      productId: "p1",
      productCode: "U010001",
      price: 149.9,
      status: "active",
      publishedAt: "2026-02-01T09:00:00.000Z",
      membershipDate: "2025-03-01T10:00:00.000Z",
      identityNumber: "12345678901",
      identityKind: "tckn",
      legalName: "Ahmet Kaya",
      legalNameSource: "bank_account_holder",
      sellerKind: "individual",
      storeName: "ahmet_k",
    });
    // Kanonik yollar: /listings/:id ve /u/:kullanıcıAdı (ne /products ne /seller).
    expect(row.listingUrl).toMatch(/\/listings\/p1$/);
    expect(row.profileUrl).toMatch(/\/u\/ahmet_k$/);
  });

  it("hiç yayınlanmamış ilanda yayın tarihi boş kalır (createdAt'e düşmez)", () => {
    expect(toGibRow(product({ publishedAt: null }) as never)).toMatchObject({
      publishedAt: null,
      createdAt: "2026-01-30T09:00:00.000Z",
    });
  });

  it("silinmiş satıcıda profil adresi ve mağaza adı boştur, kimlik arşivden gelir", () => {
    const row = toGibRow(
      product({
        seller: {
          ...product().seller,
          displayName: "Silinmiş Kullanıcı",
          bankAccount: null,
          deletedAt: new Date("2026-03-01T00:00:00Z"),
          deletedIdentity: {
            displayName: "Gerçek Ad",
            companyName: "Eski Ltd.",
            taxId: "1234567890",
            nationalId: null,
            bankAccountHolder: null,
            businessStatus: BusinessStatus.approved,
          },
        },
      }) as never,
    );
    expect(row).toMatchObject({
      sellerDeleted: true,
      sellerKind: "corporate",
      legalName: "Eski Ltd.",
      legalNameSource: "archive_company",
      identityNumber: "1234567890",
      storeName: null,
      profileUrl: null,
    });
  });
});

describe("AdminGibReportService.list", () => {
  it("yalnız listing türündeki ürünleri sorgular (üyelik/öne çıkarma sanal ürünleri hariç)", async () => {
    const { service, prisma } = makeService();
    await service.list({});
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: "listing" }),
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ kind: "listing" }),
    });
  });

  it("varsayılan sıra son yayın (boşlar sonda) + sayfa kaymasın diye id", async () => {
    const { service, prisma } = makeService();
    await service.list({});
    expect(prisma.product.findMany.mock.calls[0][0].orderBy).toEqual([
      { publishedAt: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
  });

  it("sıralama ilan alanı ya da satıcı ilişki yolu olabilir", async () => {
    const { service, prisma } = makeService();
    await service.list({ sortBy: "seller.createdAt", sortOrder: "asc" });
    expect(prisma.product.findMany.mock.calls[0][0].orderBy[0]).toEqual({
      seller: { createdAt: "asc" },
    });
  });

  it("satırları rapor biçimine çevirir ve zarfı korur", async () => {
    const { service } = makeService();
    const result = await service.list({});
    expect(result.meta).toMatchObject({ total: 1, page: 1 });
    expect(result.data[0]).toMatchObject({
      productId: "p1",
      identityNumber: "12345678901",
    });
  });
});

describe("AdminGibReportService.export", () => {
  async function dataSheetOf(body: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as never);
    expect(workbook.worksheets[0].name).toBe("Özet");
    const sheet = workbook.worksheets[1];
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const first = (sheet.getRow(2).values as unknown[]).slice(1);
    return { sheet, header, first };
  }

  it("listeyle aynı filtre ve sırayla sayfa sayfa okur", async () => {
    const { service, prisma } = makeService();
    await service.export({ status: "sold" }, "admin-1", "tr");
    const args = prisma.product.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ kind: "listing", status: "sold" });
    expect(args.orderBy).toEqual([
      { publishedAt: { sort: "desc", nulls: "last" } },
      { id: "asc" },
    ]);
    expect(args).toMatchObject({ skip: 0, take: 500 });
  });

  it("dosya TAM kimlik numarasını ve yasal ad kaynağını taşır; formül hücreleri nötrlenir", async () => {
    const { service } = makeService();
    const file = await service.export({}, "admin-1", "tr");
    expect(file).toMatchObject({ rowCount: 1, truncatedAt: null });
    expect(file.filename).toMatch(
      /^gib-ilan-satici-raporu-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    const { header, first } = await dataSheetOf(file.body);
    expect(header).toHaveLength(17);
    expect(first).toContain("12345678901"); // maskesiz
    expect(first).toContain("Ahmet Kaya");
    expect(first).toContain(149.9); // fiyat sayı olarak
    expect(first.some((cell) => String(cell).startsWith("'=HYPERLINK"))).toBe(
      true,
    );
  });

  it("tarihler İstanbul duvar saatiyle gerçek tarih hücresidir", async () => {
    const { service } = makeService();
    const file = await service.export({}, "admin-1", "tr");
    const { sheet } = await dataSheetOf(file.body);
    // Üyelik tarihi (1. kolon) 2025-03-01T10:00Z → 13:00 İstanbul.
    expect(sheet.getRow(2).getCell(1).value).toEqual(
      new Date("2025-03-01T13:00:00.000Z"),
    );
  });

  it("her indirmede zorunlu denetim kaydı yazar: filtre + satır sayısı, arama TERİMİ yok", async () => {
    const { service, audit } = makeService();

    await service.export(
      {
        search: "12345678901",
        status: "active",
        sellerKind: "individual",
        identityIncomplete: true,
        startDate: "2026-01-01",
      },
      "admin-1",
      "tr",
    );

    const [actor, action, entityType, entityId, oldValue, payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType, entityId, oldValue]).toEqual([
      "admin-1",
      "gib_report_export",
      "GibReport",
      "export",
      null,
    ]);
    expect(JSON.stringify(payload)).not.toContain("12345678901");
    expect(payload).toEqual({
      resource: "gibReport",
      filters: {
        status: "active",
        sellerKind: "individual",
        identityIncomplete: true,
        startDate: "2026-01-01",
        searchApplied: true,
        searchLength: 11,
      },
      rowCount: 1,
      truncated: false,
      truncatedAt: null,
    });
  });
});
