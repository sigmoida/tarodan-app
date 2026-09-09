import { AdminTaxService } from "./admin-tax.service";

/**
 * Aylık stopaj raporu satıcı kimliğini CANLI `users` satırından okuyordu. Bir
 * satıcı silinince anonimleştirme geriye dönük vuruyordu: geçmiş dönemlerin
 * raporunda ad "Silinmiş Kullanıcı", VKN boş, e-posta `deleted_...@deleted.local`.
 * Kimlik artık arşivden çözülüyor.
 */
describe("AdminTaxService.getWithholdingReport — silinmiş satıcı", () => {
  function makeService(
    seller: Record<string, unknown>,
    archived: Map<string, unknown> = new Map(),
  ) {
    const prisma = {
      payoutTransfer: {
        findMany: jest.fn().mockResolvedValue([
          {
            sellerId: "seller-1",
            amount: 1000,
            withholdingTax: 200,
            seller,
          },
        ]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { withholdingTax: 0 }, _count: 0 }),
      },
    };
    const deletedIdentities = {
      resolveArchivedIdentities: jest.fn().mockResolvedValue(archived),
    };
    const service = new AdminTaxService(
      prisma as never,
      {} as never,
      {} as never,
      deletedIdentities as never,
    );
    return { service, deletedIdentities };
  }

  const anonymized = {
    id: "seller-1",
    displayName: "Silinmiş Kullanıcı",
    companyName: null,
    taxId: null,
    email: "deleted_seller-1@deleted.local",
    deletedAt: new Date("2026-08-01T00:00:00Z"),
  };

  it("silinmiş satıcının kimliğini arşivden çözer", async () => {
    const { service } = makeService(
      anonymized,
      new Map([
        [
          "seller-1",
          {
            displayName: "Ahmet Yılmaz",
            companyName: "Yılmaz Ltd.",
            taxId: "1234567890",
            nationalId: null,
            email: "ahmet@example.com",
          },
        ],
      ]),
    );

    const report = await service.getWithholdingReport({ year: 2026, month: 8 });

    expect(report.rows[0].sellerName).toBe("Yılmaz Ltd.");
    expect(report.rows[0].taxId).toBe("1234567890");
    expect(report.rows[0].email).toBe("ahmet@example.com");
    expect(report.rows[0].sellerDeleted).toBe(true);
    expect(report.rows[0].identityArchived).toBe(true);
  });

  it("kurumsal VKN yoksa bireysel TCKN'ye düşer", async () => {
    const { service } = makeService(
      anonymized,
      new Map([
        [
          "seller-1",
          {
            displayName: "Ahmet Yılmaz",
            companyName: null,
            taxId: null,
            nationalId: "12345678901",
            email: null,
          },
        ],
      ]),
    );

    const report = await service.getWithholdingReport({ year: 2026, month: 8 });

    expect(report.rows[0].taxId).toBe("12345678901");
  });

  it("arşivsiz silinmiş satıcıda sentinel adresi RAPORA SIZDIRMAZ", async () => {
    const { service } = makeService(anonymized);

    const report = await service.getWithholdingReport({ year: 2026, month: 8 });

    expect(report.rows[0].email).toBeNull();
    expect(report.rows[0].sellerName).toBe("—");
    // Sessiz boşluk değil, işaretli eksik: panel bunu uyarı olarak gösterebilir.
    expect(report.rows[0].identityArchived).toBe(false);
  });

  it("silinmemiş satıcıyı eskisi gibi canlı satırdan okur", async () => {
    const { service, deletedIdentities } = makeService({
      id: "seller-1",
      displayName: "Ahmet Yılmaz",
      companyName: "Yılmaz Ltd.",
      taxId: "1234567890",
      email: "ahmet@example.com",
      deletedAt: null,
    });

    const report = await service.getWithholdingReport({ year: 2026, month: 8 });

    expect(report.rows[0].sellerName).toBe("Yılmaz Ltd.");
    expect(report.rows[0].sellerDeleted).toBe(false);
    expect(report.rows[0].identityArchived).toBeNull();
    expect(deletedIdentities.resolveArchivedIdentities).toHaveBeenCalledWith(
      [],
    );
  });
});
