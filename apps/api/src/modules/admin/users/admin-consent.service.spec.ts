import * as ExcelJS from "exceljs";
import { CONSENT_DOCUMENTS } from "@tarodan/types";
import {
  AdminConsentService,
  CONSENT_EXPORT_ROW_CAP,
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
  ...over,
});

function makeService(rows: Record<string, unknown>[] = [row()]) {
  const prisma = {
    consentRecord: {
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
  const consents = { getStatus: jest.fn().mockResolvedValue([]) };
  return {
    service: new AdminConsentService(prisma as never, consents as never),
    prisma,
    consents,
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
});

describe("AdminConsentService.exportXlsx", () => {
  it("listeyle aynı filtreyi uygular ve tavan + 1 okur", async () => {
    const { service, prisma } = makeService();

    await service.exportXlsx({ document: "kvkk" }, "tr");

    const args = prisma.consentRecord.findMany.mock.calls[0][0];
    expect(args.where.document).toBe("kvkk");
    expect(args.take).toBe(CONSENT_EXPORT_ROW_CAP + 1);
  });

  it("tavan aşılırsa dosyayı kırpar ve bildirir", async () => {
    const many = Array.from({ length: CONSENT_EXPORT_ROW_CAP + 1 }, (_, i) =>
      row({ id: `c${i}` }),
    );
    const { service } = makeService(many);

    const file = await service.exportXlsx({}, "tr");

    expect(file.truncated).toBe(true);
    expect(file.rowCount).toBe(CONSENT_EXPORT_ROW_CAP);
  });

  it("dökümde kanıt kolonları (IP, kullanıcı ajanı, sürüm) yer alır", async () => {
    const { service } = makeService();

    const file = await service.exportXlsx({}, "tr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);
    const sheet = workbook.worksheets[0];
    const values = (sheet.getRow(2).values as unknown[]).map(String);

    expect(values).toEqual(
      expect.arrayContaining([
        CONSENT_DOCUMENTS.kvkk.version,
        "85.105.10.20",
        "Mozilla/5.0",
        "B10001",
      ]),
    );
  });
});

describe("AdminConsentService.status", () => {
  it("üye durumunu domain servisinden okur", async () => {
    const { service, consents } = makeService();

    await service.status("u1");

    expect(consents.getStatus).toHaveBeenCalledWith("u1");
  });
});
