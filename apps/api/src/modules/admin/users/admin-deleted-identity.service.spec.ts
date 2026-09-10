import * as ExcelJS from "exceljs";

import { AdminDeletedIdentityService } from "./admin-deleted-identity.service";
import { ARCHIVE_EXPORT_COLUMNS } from "../../../common/helpers/deleted-user-identity";

function makeService(rows: Record<string, unknown>[] = []) {
  const prisma = {
    deletedUserIdentity: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  return {
    service: new AdminDeletedIdentityService(prisma as never),
    prisma,
  };
}

const row = {
  userId: "user-1",
  adminCode: "B10001",
  username: "ahmet",
  displayName: "Ahmet Yılmaz",
  email: "ahmet@example.com",
  phone: "+905551112233",
  nationalId: "12345678901",
  taxId: null,
  taxOffice: null,
  companyName: null,
  addressCity: "İstanbul",
  addressDistrict: "Kadıköy",
  addressLine: "Örnek Mah. 1",
  iban: null,
  wasSeller: true,
  registeredAt: new Date("2024-01-01T00:00:00Z"),
  deletedAt: new Date("2026-09-05T00:00:00Z"),
  retainUntil: new Date("2036-09-05T00:00:00Z"),
};

describe("AdminDeletedIdentityService.list", () => {
  it("dönem filtresini createdAt'e değil deletedAt'e uygular", async () => {
    const { service, prisma } = makeService();

    await service.list({ startDate: "2026-09-01", endDate: "2026-09-30" });

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.deletedAt).toBeDefined();
    expect(where.createdAt).toBeUndefined();
  });

  it("saklama süresi dolanları filtreler", async () => {
    const { service, prisma } = makeService();

    await service.list({ retentionExpired: true });

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.retainUntil.lt).toBeInstanceOf(Date);
  });

  it('"hayır" seçimi süresi dolmayanlara daraltır (sessiz no-op değil)', async () => {
    const { service, prisma } = makeService();

    await service.list({ retentionExpired: false });

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.retainUntil.gte).toBeInstanceOf(Date);
  });

  it("filtre verilmezse saklama süresine göre daraltmaz", async () => {
    const { service, prisma } = makeService();

    await service.list({});

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.retainUntil).toBeUndefined();
  });

  it("aramayı kimlik kolonlarına yayar", async () => {
    const { service, prisma } = makeService();

    await service.list({ search: "12345678901" });

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    const fields = where.OR.flatMap((clause: Record<string, unknown>) =>
      Object.keys(clause),
    );
    expect(fields).toEqual(
      expect.arrayContaining(["nationalId", "taxId", "email", "username"]),
    );
  });

  it("varsayılan sıralama en yeni silmeden başlar", async () => {
    const { service, prisma } = makeService();

    await service.list({});

    expect(
      prisma.deletedUserIdentity.findMany.mock.calls[0][0].orderBy,
    ).toEqual({ deletedAt: "desc" });
  });
});

describe("AdminDeletedIdentityService.exportPeriod", () => {
  it("dönemi ay sınırlarına kapatır", async () => {
    const { service, prisma } = makeService([row]);

    await service.exportPeriod({ year: 2026, month: 9 });

    const { where } = prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.deletedAt.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(where.deletedAt.lt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("kolon sözleşmesini ve sırasını korur", async () => {
    const { service } = makeService([row]);

    const result = await service.exportPeriod({ year: 2026, month: 9 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as never);
    const sheet = workbook.getWorksheet("Bildirim 2026-09");
    const header = (sheet?.getRow(1).values as unknown[]).slice(1);

    expect(header).toEqual(ARCHIVE_EXPORT_COLUMNS.map((c) => c.header));
    expect(result.rowCount).toBe(1);
    expect(result.filename).toBe(
      "tarodan-silinen-hesap-bildirimi-2026-09.xlsx",
    );
  });

  // Tavanı sınamanın tek yolu tavan kadar satır üretmek, o da ExcelJS'e gerçek
  // bir 5000 satırlık dosya yazdırıyor: boş makinede ~4 sn, jest'in 5 sn'lik
  // varsayılanının hemen altı. Paralel koşuda düzenli olarak aşıyordu ve
  // push'u bloke ediyordu; süre testin gerçek maliyeti, açıkça yazılır.
  it("tavanı aşan dönemi SESSİZCE kırpmaz, işaretler", async () => {
    const many = Array.from({ length: 5001 }, (_, index) => ({
      ...row,
      userId: `user-${index}`,
    }));
    const { service } = makeService(many);

    const result = await service.exportPeriod({ year: 2026, month: 9 });

    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(5000);
  }, 30_000);

  it("tavan altındaki dönemi kırpılmamış işaretler", async () => {
    const { service } = makeService([row]);

    const result = await service.exportPeriod({ year: 2026, month: 9 });

    expect(result.truncated).toBe(false);
  });

  it("kayıt yoksa da geçerli bir dosya üretir", async () => {
    const { service } = makeService([]);

    const result = await service.exportPeriod({ year: 2026, month: 1 });

    expect(result.rowCount).toBe(0);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });
});

describe("AdminDeletedIdentityService.resolveArchivedIdentities", () => {
  it("boş listede sorgu açmaz", async () => {
    const { service, prisma } = makeService();

    const result = await service.resolveArchivedIdentities([]);

    expect(result.size).toBe(0);
    expect(prisma.deletedUserIdentity.findMany).not.toHaveBeenCalled();
  });

  it("kullanıcı id'sine göre eşler ve tekrarları teke indirir", async () => {
    const { service, prisma } = makeService();
    prisma.deletedUserIdentity.findMany.mockResolvedValue([
      {
        userId: "user-1",
        displayName: "Ahmet Yılmaz",
        companyName: null,
        taxId: null,
        nationalId: "12345678901",
        email: "ahmet@example.com",
      },
    ]);

    const result = await service.resolveArchivedIdentities([
      "user-1",
      "user-1",
    ]);

    expect(
      prisma.deletedUserIdentity.findMany.mock.calls[0][0].where.userId.in,
    ).toEqual(["user-1"]);
    expect(result.get("user-1")?.nationalId).toBe("12345678901");
  });
});
