import * as ExcelJS from "exceljs";
import { BusinessStatus } from "@prisma/client";
import {
  AdminGibReportService,
  GIB_REPORT_EXPORT_ROW_CAP,
  toGibRow,
} from "./admin-gib-report.service";

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

function makeService(rows: Record<string, unknown>[] = [product()]) {
  const prisma = {
    product: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  return {
    service: new AdminGibReportService(prisma as never),
    prisma,
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

describe("AdminGibReportService.exportXlsx", () => {
  async function sheetOf(body: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as never);
    const sheet = workbook.worksheets[0];
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const first = (sheet.getRow(2).values as unknown[]).slice(1);
    return { sheet, header, first };
  }

  it("listeyle aynı filtre ve sırayla çeker, tavan + 1 okur", async () => {
    const { service, prisma } = makeService();
    await service.exportXlsx({ status: "sold" }, "tr");
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ kind: "listing", status: "sold" }),
        take: GIB_REPORT_EXPORT_ROW_CAP + 1,
      }),
    );
  });

  it("dosya TAM kimlik numarasını ve yasal ad kaynağını taşır; formül hücreleri nötrlenir", async () => {
    const { service } = makeService();
    const file = await service.exportXlsx({}, "tr");
    expect(file).toMatchObject({ rowCount: 1, truncated: false });
    expect(file.filename).toMatch(
      /^gib-ilan-satici-raporu-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );

    const { header, first } = await sheetOf(file.body);
    expect(header).toHaveLength(17);
    expect(first).toContain("12345678901"); // maskesiz
    expect(first).toContain("Ahmet Kaya");
    expect(first).toContain(149.9); // fiyat sayı olarak
    expect(first.some((cell) => String(cell).startsWith("'=HYPERLINK"))).toBe(
      true,
    );
  });

  it("tavan aşılırsa kırpar ve truncated bildirir", async () => {
    const rows = Array.from({ length: GIB_REPORT_EXPORT_ROW_CAP + 1 }, (_, i) =>
      product({ id: `p${i}` }),
    );
    const { service } = makeService(rows);
    const file = await service.exportXlsx({}, "tr");
    expect(file.truncated).toBe(true);
    expect(file.rowCount).toBe(GIB_REPORT_EXPORT_ROW_CAP);
  });
});
