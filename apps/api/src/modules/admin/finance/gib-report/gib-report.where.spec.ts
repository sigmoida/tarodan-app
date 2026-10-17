import { ProductStatus } from "@prisma/client";
import { GIB_LISTING_STATUSES } from "@tarodan/types";
import { buildGibReportWhere } from "./gib-report.where";

const absent = (field: string) => ({
  OR: [{ [field]: null }, { [field]: "" }],
});

describe("buildGibReportWhere", () => {
  it("yalnız gerçek ilanları ve canlı (test olmayan) satıcıları kapsar", () => {
    expect(buildGibReportWhere({})).toEqual({
      kind: "listing",
      seller: { isTestAccount: false },
    });
  });

  it("durum filtresini uygular", () => {
    expect(buildGibReportWhere({ status: "sold" })).toMatchObject({
      kind: "listing",
      status: "sold",
    });
  });

  it("yayın tarihi aralığı createdAt değil publishedAt üzerindendir", () => {
    const where = buildGibReportWhere({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(where).toHaveProperty("publishedAt");
    expect(where).not.toHaveProperty("createdAt");
    expect((where.publishedAt as { gte: Date }).gte).toEqual(
      new Date("2026-01-01"),
    );
  });

  it("arama ilan ve satıcı kimlik alanlarına yayılır (silinmiş hesap arşivi dahil)", () => {
    const where = buildGibReportWhere({ search: "ahmet" });
    const or = ((where.AND as unknown[])[0] as { OR: unknown[] }).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { title: expect.anything() },
        { seller: { taxId: expect.anything() } },
        { seller: { bankAccount: { accountHolder: expect.anything() } } },
        { seller: { deletedIdentity: { companyName: expect.anything() } } },
      ]),
    );
  });

  it("satırda görünebilecek her kimlik kaynağında aranır: silinmiş kurumsal arşivi ve yalnız banka hesabı olan bireysel", () => {
    const where = buildGibReportWhere({ search: "1234567890" });
    const or = ((where.AND as unknown[])[0] as { OR: unknown[] }).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        // Silinmiş kurumsal: User.taxId anonimleşmede null'lanır, numara arşivde.
        { seller: { deletedIdentity: { taxId: expect.anything() } } },
        { seller: { deletedIdentity: { nationalId: expect.anything() } } },
        {
          seller: { deletedIdentity: { bankAccountHolder: expect.anything() } },
        },
        // Yalnız banka hesabında kimliği olan bireysel satıcı.
        { seller: { bankAccount: { taxId: expect.anything() } } },
        { seller: { bankAccount: { tcKimlikNo: expect.anything() } } },
        // Üyenin beyan ettiği TCKN ve yasal ad (kimlik kapısı).
        { seller: { nationalId: expect.anything() } },
        { seller: { legalLastName: expect.anything() } },
        { seller: { deletedIdentity: { legalLastName: expect.anything() } } },
      ]),
    );
  });

  describe("kimlik eksik filtresi", () => {
    const incomplete = () =>
      (
        (
          buildGibReportWhere({ identityIncomplete: true }).AND as unknown[]
        )[0] as {
          seller: { OR: Record<string, unknown>[] };
        }
      ).seller.OR;

    it("canlı satıcı: ne vergi no ne banka vergi no ne TCKN dolu — ya da banka hesabı hiç yok", () => {
      const [live] = incomplete();
      expect(live).toMatchObject({ deletedAt: null });
      const parts = live.AND as Record<string, unknown>[];
      expect(parts[0]).toEqual(absent("taxId"));
      // Üyenin beyan ettiği TCKN de boş olmalı.
      expect(parts[1]).toEqual(absent("nationalId"));
      expect(parts[2]).toEqual({
        OR: [
          { bankAccount: { is: null } },
          {
            bankAccount: {
              is: { AND: [absent("taxId"), absent("tcKimlikNo")] },
            },
          },
        ],
      });
    });

    it("silinmiş satıcı: arşiv yok ya da arşivde vergi no ve TCKN boş", () => {
      const [, archived] = incomplete();
      expect(archived).toEqual({
        deletedAt: { not: null },
        OR: [
          { deletedIdentity: { is: null } },
          {
            deletedIdentity: {
              is: { AND: [absent("taxId"), absent("nationalId")] },
            },
          },
        ],
      });
    });

    it("filtre verilmezse kimlik kısıtı eklenmez", () => {
      expect(
        buildGibReportWhere({ identityIncomplete: false }),
      ).not.toHaveProperty("AND");
    });
  });

  describe("satıcı türü filtresi", () => {
    const sellerOf = (kind: "individual" | "corporate") =>
      (
        (buildGibReportWhere({ sellerKind: kind }).AND as unknown[])[0] as {
          seller: { OR: Record<string, unknown>[] };
        }
      ).seller.OR;

    it("kurumsal: onaylı + firma adı + vergi no; arşivi olmayan silinmiş satıcı kurumsal sayılmaz", () => {
      const [live, archived] = sellerOf("corporate");
      expect(live).toMatchObject({
        deletedAt: null,
        businessStatus: "approved",
      });
      expect(archived).toEqual({
        deletedAt: { not: null },
        OR: [
          {
            deletedIdentity: {
              is: expect.objectContaining({ businessStatus: "approved" }),
            },
          },
        ],
      });
    });

    it("bireysel: NOT kullanmaz (NULL businessStatus satırı düşmesin) ve arşivsiz silinmişi içerir", () => {
      const serialized = JSON.stringify(sellerOf("individual"));
      expect(serialized).not.toContain('"NOT"');
      // businessStatus boş olan bireysel satıcı da eşleşmeli.
      expect(sellerOf("individual")[0]).toMatchObject({
        deletedAt: null,
        OR: expect.arrayContaining([{ businessStatus: null }]),
      });
      expect(sellerOf("individual")[1]).toMatchObject({
        OR: expect.arrayContaining([{ deletedIdentity: { is: null } }]),
      });
    });
  });
});

describe("GIB_LISTING_STATUSES", () => {
  it("Prisma ProductStatus ile birebir aynıdır", () => {
    expect([...GIB_LISTING_STATUSES].sort()).toEqual(
      Object.values(ProductStatus).sort(),
    );
  });
});
