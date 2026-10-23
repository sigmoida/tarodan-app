import * as ExcelJS from "exceljs";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import { ExportListService } from "../../../common/export";
import {
  AdminConsentService,
  buildConsentWhere,
} from "./admin-consent.service";

const row = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  document: "kvkk",
  version: CONSENT_DOCUMENTS.kvkk.version,
  action: "granted",
  source: "registration",
  userId: "u1",
  guestEmail: null,
  visitorId: null,
  details: null,
  ipAddress: "85.105.10.20",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-10-01T09:00:00Z"),
  user: {
    id: "u1",
    displayName: "Ahmet",
    email: "a@example.com",
    adminCode: "B10001",
  },
  checkoutGroup: null,
  order: null,
  tradeCashPayment: null,
  ...over,
});

interface FindManyArgs {
  where: Record<string, unknown>;
  orderBy: unknown;
  select?: Record<string, unknown>;
  skip?: number;
  take?: number;
}

function makeService(rows: Record<string, unknown>[] = [row()]) {
  const prisma = {
    consentRecord: {
      // Liste de döküm de skip/take ile sayfalar; mock gerçek bir tablo gibi
      // dilimler ki döküm sayfa döngüsü sonlansın.
      findMany: jest.fn(async (args: FindManyArgs) =>
        args.take === undefined
          ? rows
          : rows.slice(args.skip ?? 0, (args.skip ?? 0) + args.take),
      ),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  const consents = { getStatus: jest.fn().mockResolvedValue([]) };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminConsentService(
      prisma as never,
      consents as never,
      new ExportListService(audit as never),
    ),
    prisma,
    consents,
    audit,
  };
}

describe("buildConsentWhere", () => {
  it("belge / aksiyon / kaynak / üye filtrelerini uygular", () => {
    expect(
      buildConsentWhere({
        document: "kvkk",
        action: "granted",
        source: "consent_prompt",
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toMatchObject({
      document: "kvkk",
      action: "granted",
      source: "consent_prompt",
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("sahip türü: ziyaretçi = üye de misafir de değil", () => {
    expect(buildConsentWhere({ subjectType: "visitor" }).AND).toEqual([
      { userId: null, guestEmail: null },
    ]);
  });

  it("sahip türü üye filtresiyle ÇAKIŞMAZ (AND ile birleşir)", () => {
    const where = buildConsentWhere({
      subjectType: "user",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    expect(where.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(where.AND).toEqual([{ userId: { not: null } }]);
  });

  it("tarih aralığını kaydın oluştuğu ana uygular", () => {
    expect(
      buildConsentWhere({ startDate: "2026-10-01", endDate: "2026-10-05" })
        .createdAt,
    ).toBeDefined();
  });

  it("aramayı üye, misafir, ziyaretçi, IP ve sipariş alanlarına yayar", () => {
    const where = buildConsentWhere({ search: "85.105" });
    const or = (where.AND as Array<{ OR: unknown[] }>)[0].OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { ipAddress: { contains: "85.105", mode: "insensitive" } },
        { user: { email: { contains: "85.105", mode: "insensitive" } } },
        {
          order: { orderNumber: { contains: "85.105", mode: "insensitive" } },
        },
      ]),
    );
  });
});

describe("buildConsentWhere: trade number", () => {
  it("searches a trade consent by its trade number through the cash payment", () => {
    const where = buildConsentWhere({ search: "TKS-10001" });
    const or = (where.AND as Array<{ OR: unknown[] }>)[0].OR;
    expect(or).toContainEqual({
      tradeCashPayment: {
        trade: {
          tradeNumber: { contains: "TKS-10001", mode: "insensitive" },
        },
      },
    });
  });

  it("selects the linked trade for every listed row", async () => {
    const { service, prisma } = makeService();

    await service.list({ search: "TKS-10001" });

    expect(prisma.consentRecord.findMany.mock.calls[0][0].select).toMatchObject(
      {
        tradeCashPayment: {
          select: { trade: { select: { id: true, tradeNumber: true } } },
        },
      },
    );
  });
});

describe("AdminConsentService.list", () => {
  it("varsayılan sıra en yeni kayıt önce", async () => {
    const { service, prisma } = makeService();

    await service.list({});

    expect(prisma.consentRecord.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: "desc",
    });
  });

  it("satırı sahip türü ve güncel-sürüm bayrağıyla eşler", async () => {
    const { service } = makeService([
      row(),
      row({
        id: "c2",
        document: "cookies",
        version: "2020-01-01",
        userId: null,
        user: null,
        visitorId: "6f1c2a7e-7b0f-4e0b-9a3c-2f3d1e5a9b10",
        details: { functional: false, analytics: true, marketing: false },
      }),
    ]);

    const result = await service.list({});

    expect(result.data[0]).toMatchObject({
      subjectType: "user",
      isCurrentVersion: true,
      createdAt: "2026-10-01T09:00:00.000Z",
    });
    expect(result.data[1]).toMatchObject({
      subjectType: "visitor",
      isCurrentVersion: false,
      details: { analytics: true },
    });
    expect(result.meta.total).toBe(2);
  });

  it("maps a trade cash payment consent to its trade (from details)", async () => {
    const tradeDetails = {
      tradeId: "trade-1",
      tradeNumber: "TKS-10001",
      tradeCashPaymentId: "tcp-1",
    };
    const { service } = makeService([
      row({
        document: "distance_sales",
        version: CONSENT_DOCUMENTS.distance_sales.version,
        source: "payment",
        details: tradeDetails,
      }),
      row({ id: "c2" }),
      // Only a distance sales row is read as a trade reference.
      row({ id: "c3", document: "cookies", details: tradeDetails }),
    ]);

    const result = await service.list({});

    expect(result.data[0]).toMatchObject({
      trade: { id: "trade-1", tradeNumber: "TKS-10001" },
      order: null,
      checkoutGroup: null,
    });
    expect(result.data[1].trade).toBeNull();
    expect(result.data[2].trade).toBeNull();
  });

  it("maps a trade consent to its trade through the linked cash payment", async () => {
    const { service } = makeService([
      row({
        document: "distance_sales",
        version: CONSENT_DOCUMENTS.distance_sales.version,
        source: "payment",
        details: {
          tradeId: "trade-1",
          tradeNumber: "TKS-10001",
          tradeCashPaymentId: "tcp-1",
        },
        tradeCashPayment: {
          trade: { id: "trade-1", tradeNumber: "TKS-10001" },
        },
      }),
    ]);

    const result = await service.list({});

    expect(result.data[0].trade).toEqual({
      id: "trade-1",
      tradeNumber: "TKS-10001",
    });
  });

  it("exports the trade number of a linked trade consent (no details)", async () => {
    const { service } = makeService([
      row({
        document: "distance_sales",
        version: CONSENT_DOCUMENTS.distance_sales.version,
        source: "payment",
        details: null,
        tradeCashPayment: {
          trade: { id: "trade-1", tradeNumber: "TKS-10001" },
        },
      }),
    ]);

    const file = await service.export({}, "admin-1", "tr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    const sheet = workbook.worksheets[1];
    const header = (sheet.getRow(1).values as unknown[]).map(String);
    const values = sheet.getRow(2).values as unknown[];

    expect(values[header.indexOf("Takas no")]).toBe("TKS-10001");
  });
});

describe("AdminConsentService.export", () => {
  it("listeyle aynı filtre ve sırayla sayfa sayfa okur", async () => {
    const { service, prisma } = makeService();

    await service.export({ document: "kvkk" }, "admin-1", "tr");

    const args = prisma.consentRecord.findMany.mock.calls[0][0];
    expect(args.where.document).toBe("kvkk");
    // Listenin sırası + sayfa sınırında eşit anları sabitleyen id.
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
    expect(args).toMatchObject({ skip: 0, take: 500 });
  });

  it("zorunlu denetim kaydı yazar; arama TERİMİ yazılmaz", async () => {
    const { service, audit } = makeService();

    const file = await service.export(
      { search: "ahmet@example.com", action: "granted" },
      "admin-1",
      "tr",
    );

    expect(file.filename).toMatch(/^onay-kayitlari-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [actor, action, entityType, , , payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType]).toEqual([
      "admin-1",
      "consent_records_export",
      "ConsentRecord",
    ]);
    expect(JSON.stringify(payload)).not.toContain("ahmet@example.com");
    expect(payload).toMatchObject({
      resource: "consents",
      filters: { action: "granted", searchApplied: true, searchLength: 17 },
      rowCount: 1,
      truncated: false,
    });
  });

  it("dökümde kanıt kolonları (IP, kullanıcı ajanı, sürüm) yer alır", async () => {
    const { service } = makeService();

    const file = await service.export({}, "admin-1", "tr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    expect(workbook.worksheets[0].name).toBe("Özet");
    const sheet = workbook.worksheets[1];
    const values = (sheet.getRow(2).values as unknown[]).map(String);

    expect(values).toEqual(
      expect.arrayContaining([
        CONSENT_DOCUMENTS.kvkk.version,
        "85.105.10.20",
        "Mozilla/5.0",
        "B10001",
        "Evet", // güncel sürüm
      ]),
    );
    // Onay anı gerçek tarih hücresi, İstanbul saatiyle (09:00Z → 12:00).
    expect(sheet.getRow(2).getCell(1).value).toEqual(
      new Date("2026-10-01T12:00:00.000Z"),
    );
  });

  it("exports the trade number of a trade cash payment consent", async () => {
    const { service } = makeService([
      row({
        document: "distance_sales",
        version: CONSENT_DOCUMENTS.distance_sales.version,
        source: "payment",
        details: {
          tradeId: "trade-1",
          tradeNumber: "TKS-10001",
          tradeCashPaymentId: "tcp-1",
        },
      }),
    ]);

    const file = await service.export({}, "admin-1", "tr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    const sheet = workbook.worksheets[1];
    const header = (sheet.getRow(1).values as unknown[]).map(String);
    const values = sheet.getRow(2).values as unknown[];

    expect(values[header.indexOf("Takas no")]).toBe("TKS-10001");
    // The trade reference is not read as cookie categories.
    expect(values[header.indexOf("Çerez kategorileri")] ?? "").toBe("");
  });
});

describe("AdminConsentService.status", () => {
  it("üye durumunu domain servisinden okur", async () => {
    const { service, consents } = makeService();

    await service.status("u1");

    expect(consents.getStatus).toHaveBeenCalledWith("u1");
  });
});
