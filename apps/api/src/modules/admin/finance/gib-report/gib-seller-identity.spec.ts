import { BusinessStatus } from "@prisma/client";
import {
  resolveGibSellerIdentity,
  type GibSellerSource,
} from "./gib-seller-identity";

const seller = (over: Partial<GibSellerSource> = {}): GibSellerSource => ({
  id: "u1",
  username: "ahmet_k",
  displayName: "ahmetcik",
  legalFirstName: null,
  legalLastName: null,
  nationalId: null,
  companyName: null,
  taxId: null,
  businessStatus: null,
  createdAt: new Date("2025-03-01T10:00:00Z"),
  deletedAt: null,
  bankAccount: null,
  addresses: [],
  deletedIdentity: null,
  ...over,
});

const corporate = (over: Partial<GibSellerSource> = {}) =>
  seller({
    companyName: "Minyatür Ticaret A.Ş.",
    taxId: "1234567890",
    businessStatus: BusinessStatus.approved,
    ...over,
  });

describe("resolveGibSellerIdentity — yasal ad zinciri", () => {
  it("onaylı kurumsal satıcıda firma adı kazanır", () => {
    const result = resolveGibSellerIdentity(
      corporate({
        bankAccount: {
          accountHolder: "Ali Veli",
          tcKimlikNo: null,
          taxId: null,
        },
        addresses: [{ fullName: "Ayşe Yılmaz" }],
      }),
    );
    expect(result).toMatchObject({
      sellerKind: "corporate",
      legalName: "Minyatür Ticaret A.Ş.",
      legalNameSource: "company",
    });
  });

  it("bireysel satıcıda firma adı DOLU olsa bile onaylı kimlik yoksa banka sahibi kullanılır", () => {
    const result = resolveGibSellerIdentity(
      seller({
        companyName: "Bekleyen Ltd.",
        businessStatus: BusinessStatus.pending,
        taxId: "1234567890",
        bankAccount: {
          accountHolder: "Ali Veli",
          tcKimlikNo: null,
          taxId: null,
        },
      }),
    );
    expect(result).toMatchObject({
      sellerKind: "individual",
      legalName: "Ali Veli",
      legalNameSource: "bank_account_holder",
    });
  });

  it("kurumsal ama firma adı boşsa zincirin sonraki adımına düşer", () => {
    const result = resolveGibSellerIdentity(
      corporate({
        companyName: "  ",
        addresses: [{ fullName: "Ayşe Yılmaz" }],
      }),
    );
    // Boş firma adı => hasApprovedCorporateIdentity de false: bireysel sayılır.
    expect(result).toMatchObject({
      sellerKind: "individual",
      legalName: "Ayşe Yılmaz",
      legalNameSource: "address",
    });
  });

  it("banka hesabı yoksa varsayılan adresin ad-soyadı kullanılır", () => {
    const result = resolveGibSellerIdentity(
      seller({ addresses: [{ fullName: "Ayşe Yılmaz" }] }),
    );
    expect(result).toMatchObject({
      legalName: "Ayşe Yılmaz",
      legalNameSource: "address",
    });
  });

  it("boş banka sahibi adı atlanır", () => {
    const result = resolveGibSellerIdentity(
      seller({
        bankAccount: { accountHolder: "   ", tcKimlikNo: null, taxId: null },
        addresses: [{ fullName: "Ayşe Yılmaz" }],
      }),
    );
    expect(result.legalNameSource).toBe("address");
  });

  it("üyenin beyan ettiği yasal ad banka sahibi / adres / görünen addan önce gelir", () => {
    const result = resolveGibSellerIdentity(
      seller({
        legalFirstName: "Ayşe Nur",
        legalLastName: "Yılmaz",
        bankAccount: {
          accountHolder: "Ali Veli",
          tcKimlikNo: null,
          taxId: null,
        },
        addresses: [{ fullName: "Başka Biri" }],
      }),
    );
    expect(result).toMatchObject({
      legalName: "Ayşe Nur Yılmaz",
      legalNameSource: "legal_name",
    });
  });

  it("onaylı kurumsal satıcıda firma adı yasal adın da önündedir (yasal satıcı firma)", () => {
    const result = resolveGibSellerIdentity(
      corporate({ legalFirstName: "Ayşe", legalLastName: "Yılmaz" }),
    );
    expect(result.legalNameSource).toBe("company");
  });

  it("hiçbiri yoksa görünen ada düşer ve kaynak display_name olarak işaretlenir", () => {
    const result = resolveGibSellerIdentity(seller());
    expect(result).toMatchObject({
      legalName: "ahmetcik",
      legalNameSource: "display_name",
    });
  });

  it("anonim sentinel ad (Silinmiş Kullanıcı) kimlik sayılmaz", () => {
    const result = resolveGibSellerIdentity(
      seller({ displayName: "Silinmiş Kullanıcı" }),
    );
    expect(result).toMatchObject({ legalName: null, legalNameSource: "none" });
  });
});

describe("resolveGibSellerIdentity — silinmiş satıcı (arşiv)", () => {
  const deleted = (
    archive: GibSellerSource["deletedIdentity"],
    over: Partial<GibSellerSource> = {},
  ) =>
    seller({
      displayName: "Silinmiş Kullanıcı",
      deletedAt: new Date("2026-01-01T00:00:00Z"),
      deletedIdentity: archive,
      ...over,
    });

  const archive = (
    over: Partial<NonNullable<GibSellerSource["deletedIdentity"]>> = {},
  ) => ({
    displayName: "Gerçek Ad",
    legalFirstName: null,
    legalLastName: null,
    companyName: null,
    taxId: null,
    nationalId: null,
    bankAccountHolder: null,
    businessStatus: null,
    ...over,
  });

  it("kurumsal arşivde firma adı kullanılır", () => {
    const result = resolveGibSellerIdentity(
      deleted(
        archive({
          companyName: "Eski Firma Ltd.",
          taxId: "9876543210",
          businessStatus: BusinessStatus.approved,
          bankAccountHolder: "Ali Veli",
        }),
      ),
    );
    expect(result).toMatchObject({
      sellerKind: "corporate",
      sellerDeleted: true,
      legalName: "Eski Firma Ltd.",
      legalNameSource: "archive_company",
      identityNumber: "9876543210",
      identityKind: "tax_number",
    });
  });

  it("bireysel arşivde banka sahibi, sonra arşivdeki görünen ad kullanılır", () => {
    expect(
      resolveGibSellerIdentity(
        deleted(
          archive({ bankAccountHolder: "Ali Veli", nationalId: "11111111111" }),
        ),
      ),
    ).toMatchObject({
      legalName: "Ali Veli",
      legalNameSource: "archive_bank_account_holder",
      identityNumber: "11111111111",
      identityKind: "tckn",
    });

    expect(resolveGibSellerIdentity(deleted(archive()))).toMatchObject({
      legalName: "Gerçek Ad",
      legalNameSource: "archive_display_name",
    });
  });

  it("bireysel arşivde yasal ad banka sahibinden, beyan edilen TCKN vergi no'dan önce gelir", () => {
    expect(
      resolveGibSellerIdentity(
        deleted(
          archive({
            legalFirstName: "Ayşe",
            legalLastName: "Yılmaz",
            bankAccountHolder: "Ali Veli",
            nationalId: "10000000146",
            taxId: "3333333333",
          }),
        ),
      ),
    ).toMatchObject({
      legalName: "Ayşe Yılmaz",
      legalNameSource: "archive_legal_name",
      identityNumber: "10000000146",
      identityKind: "tckn",
    });
  });

  it("silinmiş satıcıda canlı satırın değerleri okunmaz; mağaza ve profil boştur", () => {
    const result = resolveGibSellerIdentity(
      deleted(archive(), {
        taxId: "5555555555",
        bankAccount: { accountHolder: "Canlı", tcKimlikNo: "2", taxId: null },
      }),
    );
    expect(result).toMatchObject({
      identityNumber: null,
      identityKind: null,
      storeName: null,
      profileHandle: null,
    });
  });

  it("arşivi olmayan silinmiş satıcı: ad ve kimlik boş, bireysel", () => {
    expect(resolveGibSellerIdentity(deleted(null))).toMatchObject({
      sellerKind: "individual",
      sellerDeleted: true,
      legalName: null,
      legalNameSource: "none",
      identityNumber: null,
    });
  });

  it("üyelik tarihi hesabın oluşturulma anıdır", () => {
    expect(resolveGibSellerIdentity(deleted(null)).membershipDate).toEqual(
      new Date("2025-03-01T10:00:00Z"),
    );
  });
});

describe("resolveGibSellerIdentity — kimlik numarası", () => {
  it("kullanıcı vergi numarası, banka vergi numarası, TCKN sırasıyla seçilir", () => {
    expect(
      resolveGibSellerIdentity(
        seller({
          taxId: "1111111111",
          bankAccount: {
            accountHolder: "A",
            tcKimlikNo: "22222222222",
            taxId: "3333333333",
          },
        }),
      ),
    ).toMatchObject({
      identityNumber: "1111111111",
      identityKind: "tax_number",
    });

    expect(
      resolveGibSellerIdentity(
        seller({
          bankAccount: {
            accountHolder: "A",
            tcKimlikNo: "22222222222",
            taxId: "3333333333",
          },
        }),
      ),
    ).toMatchObject({
      identityNumber: "3333333333",
      identityKind: "tax_number",
    });

    expect(
      resolveGibSellerIdentity(
        seller({
          bankAccount: {
            accountHolder: "A",
            tcKimlikNo: " 22222222222 ",
            taxId: null,
          },
        }),
      ),
    ).toMatchObject({ identityNumber: "22222222222", identityKind: "tckn" });
  });

  it("bireysel satıcıda beyan edilen TCKN eski kaynaklardan (vergi no, banka TCKN) önce gelir", () => {
    expect(
      resolveGibSellerIdentity(
        seller({
          nationalId: "10000000146",
          taxId: "1111111111",
          bankAccount: {
            accountHolder: "A",
            tcKimlikNo: "22222222222",
            taxId: "3333333333",
          },
        }),
      ),
    ).toMatchObject({ identityNumber: "10000000146", identityKind: "tckn" });
  });

  it("onaylı kurumsal satıcıda firma vergi no'su yetkilinin TCKN'sinden önce gelir", () => {
    expect(
      resolveGibSellerIdentity(corporate({ nationalId: "10000000146" })),
    ).toMatchObject({
      identityNumber: "1234567890",
      identityKind: "tax_number",
    });
  });

  it("hiçbir kaynakta yoksa boş bırakılır (tahmin edilmez)", () => {
    expect(
      resolveGibSellerIdentity(
        seller({
          bankAccount: { accountHolder: "A", tcKimlikNo: "", taxId: " " },
        }),
      ),
    ).toMatchObject({ identityNumber: null, identityKind: null });
  });
});

describe("resolveGibSellerIdentity — herkese açık kimlik", () => {
  it("mağaza adı herkese açık ad zinciridir, profil bağlantısı kullanıcı adıdır", () => {
    expect(resolveGibSellerIdentity(seller())).toMatchObject({
      storeName: "ahmet_k",
      profileHandle: "ahmet_k",
    });
    expect(resolveGibSellerIdentity(corporate())).toMatchObject({
      storeName: "Minyatür Ticaret A.Ş.",
    });
  });

  it("legacy kullanıcı adında profil bağlantısı id'ye düşer", () => {
    expect(
      resolveGibSellerIdentity(seller({ username: "legacy_12345678" })),
    ).toMatchObject({ profileHandle: "u1" });
  });
});
