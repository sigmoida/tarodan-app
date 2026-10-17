import * as ExcelJS from "exceljs";

import { translateMessage } from "../../i18n/translate";
import { ExportListService, type Translate } from "../../../common/export";
import {
  AdminDeletedIdentityService,
  EXPORT_FORMAT_VERSION,
  deletedIdentityInfoRows,
} from "./admin-deleted-identity.service";

function makeService(rows: Record<string, unknown>[] = []) {
  const prisma = {
    deletedUserIdentity: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminDeletedIdentityService(
      prisma as never,
      new ExportListService(audit as never),
    ),
    prisma,
    audit,
  };
}

/** Portalın beklediği kolon başlıkları ve SIRASI — resmî biçimin sözleşmesi. */
const PORTAL_HEADER = [
  "Kullanıcı Kodu",
  "Kullanıcı Adı",
  "Ad Soyad / Unvan",
  "E-posta",
  "Telefon",
  "TC Kimlik No",
  "Vergi No",
  "Vergi Dairesi",
  "Firma Adı",
  "İl",
  "İlçe",
  "Adres",
  "IBAN",
  "Satıcı",
  "Kayıt Tarihi",
  "Silinme Tarihi",
  "Saklama Bitişi",
];

const row = {
  id: "identity-1",
  userId: "user-1",
  adminCode: "B10001",
  username: "ahmet",
  displayName: "Ahmet Yılmaz",
  legalFirstName: null,
  legalLastName: null,
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
  async function load(body: Buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as never);
    return workbook;
  }

  /**
   * BİLİNÇLİ DEĞİŞİKLİK: ay sınırları eskiden UTC gece yarısıydı
   * (2026-09-01T00:00Z) — ayın son gecesi 21:00'den sonra silinen hesap bir
   * sonraki ayın bildirimine düşüyordu. Artık Türkiye takvimi: 1 Eylül 00:00
   * İstanbul = 31 Ağustos 21:00Z.
   */
  it("dönemi TÜRKİYE takviminde ay sınırlarına kapatır", async () => {
    const { service, prisma } = makeService([row]);

    await service.exportPeriod({ year: 2026, month: 9 }, "admin-1");

    const { where, orderBy } =
      prisma.deletedUserIdentity.findMany.mock.calls[0][0];
    expect(where.deletedAt.gte.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(where.deletedAt.lt.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(orderBy).toEqual([{ deletedAt: "asc" }, { id: "asc" }]);
  });

  it("Özet, Bildirim ve Bilgi sayfalarını bu sırayla yazar; kolon sözleşmesi korunur", async () => {
    const { service } = makeService([row]);

    const file = await service.exportPeriod({ year: 2026, month: 9 }, "admin-1");

    const workbook = await load(file.body);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Özet",
      "Bildirim 2026-09",
      "Bilgi",
    ]);
    const sheet = workbook.getWorksheet("Bildirim 2026-09");
    const header = (sheet?.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(PORTAL_HEADER);
    expect(file.rowCount).toBe(1);
    expect(file.truncatedAt).toBeNull();
    expect(file.filename).toMatch(
      /^tarodan-silinen-hesap-bildirimi-2026-09-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
  });

  it("resmî bildirim kimliği maskesiz, tarihleri İstanbul takviminde yazar", async () => {
    const { service } = makeService([row]);

    const file = await service.exportPeriod({ year: 2026, month: 9 }, "admin-1");

    const sheet = (await load(file.body)).getWorksheet("Bildirim 2026-09");
    const cells = sheet?.getRow(2);
    const col = (title: string) => PORTAL_HEADER.indexOf(title) + 1;
    expect(cells?.getCell(col("TC Kimlik No")).value).toBe("12345678901");
    expect(cells?.getCell(col("Satıcı")).value).toBe("Evet");
    // 2026-09-05T00:00Z = 03:00 İstanbul, gün biçimiyle.
    expect(cells?.getCell(col("Silinme Tarihi")).value).toEqual(
      new Date("2026-09-05T03:00:00.000Z"),
    );
    expect(cells?.getCell(col("Silinme Tarihi")).numFmt).toBe("dd.mm.yyyy");
  });

  it("Bilgi sayfası dönemi, kayıt sayısını ve biçim sürümünü taşır", async () => {
    const { service } = makeService([row]);

    const file = await service.exportPeriod({ year: 2026, month: 9 }, "admin-1");

    const info = (await load(file.body)).getWorksheet("Bilgi");
    const rows = (info?.getSheetValues() ?? []).filter(Boolean) as unknown[][];
    const byLabel = new Map(rows.map((r) => [r[1], r[2]]));
    expect(byLabel.get("Dönem")).toBe("2026-09");
    expect(byLabel.get("Kayıt sayısı")).toBe(1);
    expect(byLabel.get("Biçim sürümü")).toBe(EXPORT_FORMAT_VERSION);
  });

  it("kırpılan dönemi Bilgi sayfasında da SESSİZ bırakmaz", () => {
    const t: Translate = (key, values) => translateMessage(key, "tr", values);
    const rows = deletedIdentityInfoRows(t, "2026-09", {
      rowCount: 20000,
      truncatedAt: 20000,
      generatedAt: new Date(),
    });
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ label: "Notlar" });
    expect(String(last.value)).toContain("ilk 20.000 kaydı");

    const complete = deletedIdentityInfoRows(t, "2026-09", {
      rowCount: 1,
      truncatedAt: null,
      generatedAt: new Date(),
    });
    expect(complete.some((r) => r.label === "Notlar")).toBe(false);
  });

  it("zorunlu denetim kaydı dönemi anahtar alır; kimlik DEĞERİ yazılmaz", async () => {
    const { service, audit } = makeService([row]);

    await service.exportPeriod(
      { year: 2026, month: 9, wasSeller: true },
      "admin-1",
    );

    const [actor, action, entityType, entityId, , payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType, entityId]).toEqual([
      "admin-1",
      "deleted_identity_export",
      "DeletedUserIdentity",
      "2026-09",
    ]);
    expect(payload).toMatchObject({
      filters: { year: 2026, month: 9, wasSeller: true },
      rowCount: 1,
      truncated: false,
    });
    expect(JSON.stringify(payload)).not.toContain("12345678901");
  });

  it("kayıt yoksa da geçerli bir dosya üretir", async () => {
    const { service } = makeService([]);

    const file = await service.exportPeriod({ year: 2026, month: 1 }, "admin-1");

    expect(file.rowCount).toBe(0);
    expect(file.body.byteLength).toBeGreaterThan(0);
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
