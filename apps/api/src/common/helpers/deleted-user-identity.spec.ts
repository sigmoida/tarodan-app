import {
  ANONYMIZED_DISPLAY_NAME,
  anonymizedEmailFor,
  archiveLegalFullName,
  archivedNationalIdIsDeclared,
  computeRetainUntil,
  IDENTITY_RETENTION_YEARS,
  isAnonymizedEmail,
  resolveIdentityFields,
  type IdentitySources,
} from "./deleted-user-identity";

/**
 * Kimlik çözümlemesi hem silme yolunun hem backfill script'inin tek kaynağı;
 * öncelik sırası burada sabitlenir. Yanlış öncelik, yasal bir kayda yanlış
 * kimlik yazar — sessizce.
 */
describe("resolveIdentityFields", () => {
  const baseUser: IdentitySources["user"] = {
    id: "user-1",
    email: "ahmet@example.com",
    username: "ahmet",
    displayName: "Ahmet Yılmaz",
    legalFirstName: null,
    legalLastName: null,
    nationalId: null,
    phone: "+905551112233",
    birthDate: new Date("1985-06-01T00:00:00Z"),
    taxId: null,
    taxOffice: null,
    companyName: null,
    companyType: null,
    companyCity: null,
    companyDistrict: null,
    sellerType: null,
    businessStatus: null,
    isSeller: false,
    adminCode: "B10001",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    deletedAt: null,
  };

  it("TCKN'de üyenin beyanı (User.nationalId) banka hesabından ÖNCE gelir", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: { ...baseUser, nationalId: "10000000146" },
      bankAccount: {
        tcKimlikNo: "12345678950",
        taxId: null,
        iban: null,
        accountHolder: null,
      },
    });

    expect(values.nationalId).toBe("10000000146");
    expect(sourceDetail.nationalId).toBe("user");
  });

  it("üyenin beyanı boşsa eski kaynağa (banka hesabı) düşer", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: baseUser,
      bankAccount: {
        tcKimlikNo: "12345678950",
        taxId: null,
        iban: null,
        accountHolder: null,
      },
    });

    expect(values.nationalId).toBe("12345678950");
    expect(sourceDetail.nationalId).toBe("seller_bank_account");
  });

  it("yasal ad yalnız üyenin beyanından gelir, görünen addan tahmin edilmez", () => {
    const declared = resolveIdentityFields({
      user: {
        ...baseUser,
        legalFirstName: "Ahmet Can",
        legalLastName: "Yılmaz",
      },
    });
    expect(declared.values.legalFirstName).toBe("Ahmet Can");
    expect(declared.values.legalLastName).toBe("Yılmaz");
    expect(declared.sourceDetail.legalFirstName).toBe("user");

    const legacy = resolveIdentityFields({ user: baseUser });
    expect(legacy.values.legalFirstName).toBeNull();
    expect(legacy.sourceDetail).toHaveProperty("legalLastName", null);
  });

  it("silme anında canlı kullanıcı satırını tercih eder", () => {
    const { values, sourceDetail } = resolveIdentityFields({ user: baseUser });

    expect(values.email).toBe("ahmet@example.com");
    expect(values.displayName).toBe("Ahmet Yılmaz");
    expect(values.phone).toBe("+905551112233");
    expect(values.username).toBe("ahmet");
    expect(values.adminCode).toBe("B10001");
    expect(sourceDetail.email).toBe("user");
  });

  it("anonimleştirilmiş satırın sentinel değerlerini kimlik saymaz", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: {
        ...baseUser,
        email: anonymizedEmailFor("user-1"),
        displayName: ANONYMIZED_DISPLAY_NAME,
        phone: null,
      },
      auditLog: {
        id: "audit-1",
        email: "gercek@example.com",
        displayName: "Gerçek Ad",
      },
    });

    expect(values.email).toBe("gercek@example.com");
    expect(values.displayName).toBe("Gerçek Ad");
    expect(sourceDetail.email).toBe("audit_log");
  });

  it("çözülemeyen alanı boş bırakır ve provenance'ta AÇIKÇA null gösterir", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: {
        ...baseUser,
        email: anonymizedEmailFor("user-1"),
        displayName: ANONYMIZED_DISPLAY_NAME,
        phone: null,
      },
    });

    expect(values.email).toBeNull();
    expect(values.nationalId).toBeNull();
    // Anahtar eksik OLMAMALI: "aranmadı" ile "bulunamadı" ayırt edilebilsin.
    expect(sourceDetail).toHaveProperty("email", null);
    expect(sourceDetail).toHaveProperty("nationalId", null);
  });

  it("TCKN'yi banka hesabından alır ve kullanılan kaydı işaretler", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: baseUser,
      bankAccount: {
        tcKimlikNo: "12345678901",
        taxId: null,
        iban: "TR000000000000000000000000",
        accountHolder: "Ahmet Yılmaz",
      },
    });

    expect(values.nationalId).toBe("12345678901");
    expect(values.iban).toBe("TR000000000000000000000000");
    expect(sourceDetail.nationalId).toBe("seller_bank_account");
  });

  it("e-belge numarasını uzunluğa göre TCKN/VKN olarak ayırır", () => {
    const elogo = {
      id: "elogo-1",
      recipientVknTckn: "1234567890",
      recipientName: null,
      recipientEmail: null,
      recipientCity: null,
      recipientDistrict: null,
      recipientStreet: null,
    };

    const vkn = resolveIdentityFields({ user: baseUser, elogoInvoice: elogo });
    expect(vkn.values.taxId).toBe("1234567890");
    expect(vkn.values.nationalId).toBeNull();

    const tckn = resolveIdentityFields({
      user: baseUser,
      elogoInvoice: { ...elogo, recipientVknTckn: "12345678901" },
    });
    expect(tckn.values.nationalId).toBe("12345678901");
    expect(tckn.values.taxId).toBeNull();
  });

  it("ortak kaydının TCKN'sini yalnız yetkiliyle eşleşince alır", () => {
    const corp = {
      id: "corp-1",
      authorizedFullName: "Ahmet Yılmaz",
      companyLegalName: "Yılmaz Ltd.",
      companyTitle: null,
      companyEmail: null,
      companyAddress: null,
      companyCity: null,
      companyDistrict: null,
      phone: null,
      contactPhone: null,
      taxId: null,
      taxOffice: null,
      companyType: null,
      iban: null,
      bankAccountHolder: null,
    };

    // Başka bir gerçek kişinin numarası bu kullanıcıya YAZILMAZ.
    const other = resolveIdentityFields({
      user: baseUser,
      corporateApplication: {
        ...corp,
        stakeholders: [
          {
            fullName: "Başka Kişi",
            identityType: "tckn",
            identityNumber: "12345678901",
          },
        ],
      },
    });
    expect(other.values.nationalId).toBeNull();

    const matching = resolveIdentityFields({
      user: baseUser,
      corporateApplication: {
        ...corp,
        stakeholders: [
          {
            fullName: "Ahmet Yılmaz",
            identityType: "tckn",
            identityNumber: "12345678901",
          },
        ],
      },
    });
    expect(matching.values.nationalId).toBe("12345678901");
    expect(matching.sourceRefs.corporateApplicationId).toBe("corp-1");
  });

  it("adres yoksa sipariş snapshot'ından adresi kurtarır", () => {
    const { values, sourceDetail, sourceRefs } = resolveIdentityFields({
      user: { ...baseUser, phone: null },
      order: {
        id: "order-1",
        shippingAddress: {
          fullName: "Ahmet Yılmaz",
          phone: "+905553334455",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Örnek Mah. 1",
        },
      },
    });

    expect(values.phone).toBe("+905553334455");
    expect(values.addressCity).toBe("İstanbul");
    expect(values.addressLine).toBe("Örnek Mah. 1");
    expect(sourceDetail.addressCity).toBe("order_shipping_address");
    expect(sourceRefs.orderId).toBe("order-1");
  });

  it("bozuk Json snapshot'ında patlamaz", () => {
    const { values } = resolveIdentityFields({
      user: { ...baseUser, phone: null },
      order: { id: "order-1", shippingAddress: "bozuk" },
    });

    expect(values.phone).toBeNull();
    expect(values.addressCity).toBeNull();
  });

  it("satıcılığı kalıntı kayıtlardan türetir (isSeller silmede false'a çekiliyor)", () => {
    const { values } = resolveIdentityFields({
      user: { ...baseUser, isSeller: false },
      payoutTransfer: {
        id: "payout-1",
        transferIban: "TR11",
        transferName: "Ahmet Yılmaz",
      },
    });

    expect(values.wasSeller).toBe(true);
  });

  it("boş metni dolu kaynak saymaz", () => {
    const { values, sourceDetail } = resolveIdentityFields({
      user: { ...baseUser, email: "   " },
      auditLog: { id: "audit-1", email: "gercek@example.com" },
    });

    expect(values.email).toBe("gercek@example.com");
    expect(sourceDetail.email).toBe("audit_log");
  });
});

describe("saklama süresi", () => {
  it("silme tarihine 10 yıl ekler", () => {
    const until = computeRetainUntil(new Date("2026-09-09T10:00:00Z"));
    expect(until.getUTCFullYear()).toBe(2026 + IDENTITY_RETENTION_YEARS);
  });
});

describe("anonim e-posta tespiti", () => {
  it("sentinel adresi tanır, gerçek adresi tanımaz", () => {
    expect(isAnonymizedEmail(anonymizedEmailFor("abc"))).toBe(true);
    expect(isAnonymizedEmail("ahmet@example.com")).toBe(false);
    expect(isAnonymizedEmail(null)).toBe(false);
  });
});

describe("archiveLegalFullName", () => {
  it("bildirimde yasal ad-soyadı tercih eder, yoksa silme anındaki ada düşer", () => {
    expect(
      archiveLegalFullName({
        legalFirstName: "Ahmet Can",
        legalLastName: "Yılmaz",
        displayName: "ahmetcik",
      }),
    ).toBe("Ahmet Can Yılmaz");
    expect(
      archiveLegalFullName({
        legalFirstName: null,
        legalLastName: null,
        displayName: "Ahmet Yılmaz",
      }),
    ).toBe("Ahmet Yılmaz");
    expect(
      archiveLegalFullName({
        legalFirstName: null,
        legalLastName: null,
        displayName: null,
      }),
    ).toBeNull();
  });
});

describe("archiveLegalFullName — yarım ad", () => {
  it("yalnız ad ya da yalnız soyad yasal ad sayılmaz; silme anındaki ada düşülür", () => {
    expect(
      archiveLegalFullName({
        legalFirstName: "Ahmet",
        legalLastName: null,
        displayName: "Ahmet Yılmaz",
      }),
    ).toBe("Ahmet Yılmaz");
    expect(
      archiveLegalFullName({
        legalFirstName: null,
        legalLastName: "Yılmaz",
        displayName: null,
      }),
    ).toBeNull();
  });
});

describe("archivedNationalIdIsDeclared", () => {
  it("yalnız kaynağı üyenin kendi alanı olan numara beyan sayılır", () => {
    expect(archivedNationalIdIsDeclared({ nationalId: "user" })).toBe(true);
    expect(
      archivedNationalIdIsDeclared({ nationalId: "seller_bank_account" }),
    ).toBe(false);
    expect(archivedNationalIdIsDeclared({ nationalId: null })).toBe(false);
    expect(archivedNationalIdIsDeclared(null)).toBe(false);
    expect(archivedNationalIdIsDeclared(["user"])).toBe(false);
  });

  it("canlı silmede beyan edilen numaranın kaynağı 'user' olarak yazılır (iki uç aynı anahtarı kullanır)", () => {
    const { sourceDetail } = resolveIdentityFields({
      user: {
        id: "u1",
        email: "a@example.com",
        username: "a",
        displayName: "A",
        legalFirstName: "Ahmet",
        legalLastName: "Yılmaz",
        nationalId: "10000000146",
        phone: null,
        birthDate: null,
        taxId: null,
        taxOffice: null,
        companyName: null,
        companyType: null,
        companyCity: null,
        companyDistrict: null,
        sellerType: null,
        businessStatus: null,
        isSeller: false,
        adminCode: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        deletedAt: null,
      },
    });
    expect(archivedNationalIdIsDeclared(sourceDetail)).toBe(true);
  });
});
