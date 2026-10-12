import { Prisma, type NetsisSyncRecord } from "@prisma/client";
import { NetsisRequestException, NetsisStubGateway } from "../../netsis";
import { NotificationType } from "../../notification/dto";
import { NETSIS_INVOICE_SETTING_KEYS } from "../provider/netsis-invoice-settings";
import { NETSIS_ACCOUNTING_FIELDS } from "./netsis-accounting-mapper";
import { NetsisAccountingPostingService } from "./netsis-accounting-posting.service";
import { NETSIS_ACCOUNTING_SETTING_KEYS } from "./netsis-accounting-settings";
import type { NetsisAccountingSourceLoad } from "./netsis-accounting-source.service";
import { NETSIS_SYNC_MAX_ATTEMPTS } from "./netsis-sync-failure-policy";

const A = NETSIS_ACCOUNTING_SETTING_KEYS;
const RETAIL = "120.99.001";

const READY_SETTINGS: Record<string, string> = {
  [A.enabled]: "true",
  [A.paytrClearing]: "102.99.001",
  [A.mainBank]: "102.01.001",
  [NETSIS_INVOICE_SETTING_KEYS.retailCariCode]: RETAIL,
};

const PAYOUT_LOAD: NetsisAccountingSourceLoad = {
  state: "ready",
  source: {
    kind: "payout_transfer",
    reference: "PTR-1",
    amount: new Prisma.Decimal("845.10"),
    completedAt: new Date("2026-10-05T10:00:00Z"),
    seller: { name: "Ayşe Yılmaz", taxId: "12345678901", adminCode: "B010001" },
    ibanLast4: "1234",
  },
};

const network = (code: string) =>
  new NetsisRequestException(
    "network",
    null,
    "POST: TypeError",
    undefined,
    Object.assign(new TypeError("fetch failed"), { cause: { code } }),
  );

type Row = NetsisSyncRecord;

/** Tek satırlık bellek içi `netsisSyncRecord` — CAS ve yazım sırasını taklit eder. */
function fakePrisma(
  initial: Partial<Row>,
  settings: Record<string, string> = READY_SETTINGS,
) {
  const row: Row = {
    id: "rec-1",
    kind: "payout_transfer",
    sourceType: "payout_transfer",
    sourceId: "p-1",
    idempotencyKey: "payout_transfer:p-1",
    status: "pending",
    attemptCount: 0,
    lastAttemptAt: null,
    lastError: null,
    netsisRef: null,
    payload: null,
    amount: null,
    syncedAt: null,
    createdAt: new Date("2026-10-05T10:00:00Z"),
    updatedAt: new Date("2026-10-05T10:00:00Z"),
    ...initial,
  };
  const writes: Array<Record<string, unknown>> = [];
  let failRefWrites = 0;
  const apply = (data: Record<string, unknown>) => {
    writes.push(data);
    const target = row as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        target[key] = (target[key] as number) + (value.increment as number);
      } else if (value && typeof value === "object" && "decrement" in value) {
        target[key] = (target[key] as number) - (value.decrement as number);
      } else if (value === Prisma.DbNull) {
        target[key] = null;
      } else {
        target[key] = value;
      }
    }
  };
  const prisma = {
    netsisSyncRecord: {
      findUnique: jest.fn(async () => ({ ...row })),
      findMany: jest.fn(async () => [{ id: row.id }]),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Partial<Row>;
          data: Record<string, unknown>;
        }) => {
          if (
            where.status !== row.status ||
            where.attemptCount !== row.attemptCount
          ) {
            return { count: 0 };
          }
          apply(data);
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if ("netsisRef" in data && !("status" in data) && failRefWrites > 0) {
          failRefWrites--;
          throw new Error("db down");
        }
        apply(data);
        return { ...row };
      }),
    },
    platformSetting: {
      findMany: jest.fn(
        async ({ where }: { where: { settingKey: { in: string[] } } }) =>
          where.settingKey.in
            .filter((key) => key in settings)
            .map((key) => ({ settingKey: key, settingValue: settings[key] })),
      ),
    },
  };
  return {
    prisma,
    row,
    writes,
    failNextRefWrites: (n: number) => {
      failRefWrites = n;
    },
  };
}

describe("NetsisAccountingPostingService", () => {
  const originalProvider = process.env.INVOICE_PROVIDER;
  beforeEach(() => {
    process.env.INVOICE_PROVIDER = "netsis";
  });
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.INVOICE_PROVIDER;
    else process.env.INVOICE_PROVIDER = originalProvider;
  });

  const build = (
    initial: Partial<Row> = {},
    opts: {
      load?: NetsisAccountingSourceLoad;
      settings?: Record<string, string>;
      enabled?: boolean;
    } = {},
  ) => {
    const db = fakePrisma(initial, opts.settings);
    const stub = new NetsisStubGateway();
    const facade = {
      enabled: opts.enabled ?? true,
      receipts: stub.receipts,
      itemSlips: stub.itemSlips,
    };
    const sources = {
      load: jest.fn().mockResolvedValue(opts.load ?? PAYOUT_LOAD),
    };
    const notifications = {
      notifyAllAdminsOnce: jest.fn().mockResolvedValue(true),
    };
    const service = new NetsisAccountingPostingService(
      db.prisma as never,
      facade as never,
      sources as never,
      notifications as never,
    );
    return { ...db, stub, facade, sources, notifications, service };
  };

  it("ortak caride satıcı ödemesini yazar: gövde → netsisRef → durum sırasıyla", async () => {
    const { service, stub, row, writes } = build();
    await stub.arps.create({ CariTemelBilgi: { CARI_KOD: RETAIL } });

    await expect(service.post("rec-1")).resolves.toBe("synced");

    const [transfer] = stub.snapshot().bankTransfers;
    expect(transfer).toMatchObject({
      CARI_KOD: RETAIL,
      TUTAR: "845.10",
      BELGE_NO: "PTR-1",
      [NETSIS_ACCOUNTING_FIELDS.trackingReference]: "payout_transfer:p-1",
    });
    expect(row).toMatchObject({
      status: "synced",
      netsisRef: transfer.ID,
      lastError: null,
    });
    expect(row.syncedAt).toBeInstanceOf(Date);
    expect(String(row.amount)).toBe("845.1");

    // Sıra: sahiplenme (gövde temizlenir) → gövde → anahtar → durum.
    const order = writes.map((w) =>
      "status" in w && w.status === "processing"
        ? "claim"
        : "payload" in w
          ? "payload"
          : "status" in w
            ? `status:${String(w.status)}`
            : "netsisRef" in w
              ? "ref"
              : "?",
    );
    expect(order).toEqual(["claim", "payload", "ref", "status:synced"]);
  });

  it("netsisRef doluysa Netsis'e GİTMEDEN synced işaretler (önceki deneme yazmış)", async () => {
    const { service, stub, row } = build({ netsisRef: "STUB-HVL-9" });
    const spy = jest.spyOn(stub.receipts, "createBankTransfer");
    await expect(service.post("rec-1")).resolves.toBe("synced");
    expect(spy).not.toHaveBeenCalled();
    expect(row.status).toBe("synced");
  });

  it("fatura tahsilatı faturanın Netsis fişindeki cariye yazılır", async () => {
    const { service, stub, row } = build(
      {
        kind: "invoice_collection",
        sourceType: "fiscal_invoice",
        sourceId: "inv-1",
        idempotencyKey: "invoice_collection:inv-1",
      },
      {
        load: {
          state: "ready",
          source: {
            kind: "invoice_collection",
            invoiceNumber: "EAR2026000000007",
            providerRef: "ftSFat:EAR2026000000007",
            issuedAt: new Date("2026-10-05T10:00:00Z"),
            gross: new Prisma.Decimal("120.00"),
          },
        },
      },
    );
    await stub.arps.create({ CariTemelBilgi: { CARI_KOD: "K010042" } });
    await stub.items.create({ StokTemelBilgi: { STOK_KODU: "HZM" } });
    await stub.itemSlips.create({
      FaturaTip: "ftSFat",
      FatUst: {
        CARI_KODU: "K010042",
        FATIRS_NO: "EAR2026000000007",
        TARIH: "2026-10-05",
      },
      Kalems: [{ STOK_KODU: "HZM", STHAR_GCMIK: 1, STHAR_NF: 100, STHAR_KDV: 20 }],
    });

    await expect(service.post("rec-1")).resolves.toBe("synced");
    expect(stub.snapshot().collections[0]).toMatchObject({
      CARI_KOD: "K010042",
      TUTAR: "120.00",
      [NETSIS_ACCOUNTING_FIELDS.closesInvoiceNumber]: "EAR2026000000007",
    });
    expect(row.netsisRef).toMatch(/^STUB-TAH-/);
  });

  it("gönderimde zaman aşımı: sonuç BİLİNMİYOR — bütçe biter, izleme anahtarı yazılır", async () => {
    const { service, stub, row } = build();
    jest
      .spyOn(stub.receipts, "createBankTransfer")
      .mockRejectedValue(network("ETIMEDOUT"));
    await expect(service.post("rec-1")).resolves.toBe("failed");
    expect(row.attemptCount).toBe(NETSIS_SYNC_MAX_ATTEMPTS);
    expect(row.lastError).toContain("payout_transfer:p-1");
    expect(row.netsisRef).toBeNull();
  });

  it("bağlantı hiç kurulamadı: pending'e döner, bütçe tüketmez", async () => {
    const { service, stub, row } = build();
    jest
      .spyOn(stub.receipts, "createBankTransfer")
      .mockRejectedValue(network("ECONNREFUSED"));
    await expect(service.post("rec-1")).resolves.toBe("pending");
    expect(row).toMatchObject({ status: "pending", attemptCount: 0 });
  });

  it("Netsis reddetti (400): bir deneme tüketir", async () => {
    const { service, stub, row } = build();
    jest
      .spyOn(stub.receipts, "createBankTransfer")
      .mockRejectedValue(new NetsisRequestException("validation", 400, "TUTAR"));
    await expect(service.post("rec-1")).resolves.toBe("failed");
    expect(row).toMatchObject({ status: "failed", attemptCount: 1 });
    expect(row.lastError).toContain("validation");
  });

  it("ortak cari ayarı yoksa (eşleme hatası) bütçe hemen biter, Netsis'e gidilmez", async () => {
    const settings = { ...READY_SETTINGS };
    delete settings[NETSIS_INVOICE_SETTING_KEYS.retailCariCode];
    const { service, stub, row } = build({}, { settings });
    const spy = jest.spyOn(stub.receipts, "createBankTransfer");
    await expect(service.post("rec-1")).resolves.toBe("failed");
    expect(spy).not.toHaveBeenCalled();
    expect(row.attemptCount).toBe(NETSIS_SYNC_MAX_ATTEMPTS);
  });

  it("kirası dolmuş processing satırında gövde doluysa: otomatik denenmez", async () => {
    const { service, stub, row } = build({
      status: "processing",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-10-01T00:00:00Z"),
      payload: { TUTAR: "845.10" },
    });
    const spy = jest.spyOn(stub.receipts, "createBankTransfer");
    await expect(service.post("rec-1")).resolves.toBe("failed");
    expect(spy).not.toHaveBeenCalled();
    expect(row.attemptCount).toBe(NETSIS_SYNC_MAX_ATTEMPTS);
    expect(row.lastError).toContain("payout_transfer:p-1");
  });

  it("kirası dolmuş ama gönderime başlamamış satır normal yazılır", async () => {
    const { service, stub, row } = build({
      status: "processing",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-10-01T00:00:00Z"),
      payload: null,
    });
    await stub.arps.create({ CariTemelBilgi: { CARI_KOD: RETAIL } });
    await expect(service.post("rec-1")).resolves.toBe("synced");
    expect(row.status).toBe("synced");
  });

  it("kirası süren satır sahiplenilmez", async () => {
    const { service, stub } = build({
      status: "processing",
      lastAttemptAt: new Date(),
    });
    const spy = jest.spyOn(stub.receipts, "createBankTransfer");
    await expect(service.post("rec-1")).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("netsisRef yazılamazsa satır insana bırakılır (çift kayıt yok)", async () => {
    const { service, stub, row, failNextRefWrites } = build();
    await stub.arps.create({ CariTemelBilgi: { CARI_KOD: RETAIL } });
    failNextRefWrites(3);
    await expect(service.post("rec-1")).resolves.toBe("failed");
    expect(stub.snapshot().bankTransfers).toHaveLength(1);
    expect(row.attemptCount).toBe(NETSIS_SYNC_MAX_ATTEMPTS);
    expect(row.lastError).toContain(String(stub.snapshot().bankTransfers[0].ID));
  });

  it("kaynak artık aynalanacak hareket değilse skipped, bütçe iade", async () => {
    const { service, row } = build(
      {},
      { load: { state: "not_applicable", reason: "Aktarılacak tutar yok" } },
    );
    await expect(service.post("rec-1")).resolves.toBe("skipped");
    expect(row).toMatchObject({
      status: "skipped",
      attemptCount: 0,
      lastError: "Aktarılacak tutar yok",
    });
  });

  describe("runPending", () => {
    it("senkron kapalıysa hiçbir şey denenmez", async () => {
      const { service, prisma } = build(
        {},
        { settings: { [A.enabled]: "false" } },
      );
      await expect(service.runPending()).resolves.toMatchObject({
        state: "inactive",
      });
      expect(prisma.netsisSyncRecord.findMany).not.toHaveBeenCalled();
    });

    it("fatura sağlayıcısı Netsis değilse inactive", async () => {
      process.env.INVOICE_PROVIDER = "elogo";
      const { service } = build();
      await expect(service.runPending()).resolves.toMatchObject({
        state: "inactive",
      });
    });

    it("NETSIS_ENABLED kapalıysa denenmez", async () => {
      const { service } = build({}, { enabled: false });
      await expect(service.runPending()).resolves.toMatchObject({
        state: "netsisDisabled",
      });
    });

    it("zorunlu hesap eksikse bütçe yakılmaz, eksik anahtarlar döner", async () => {
      const { service, prisma } = build(
        {},
        { settings: { [A.enabled]: "true" } },
      );
      await expect(service.runPending()).resolves.toEqual({
        state: "notReady",
        synced: 0,
        failed: 0,
        blockers: [A.paytrClearing, A.mainBank],
      });
      expect(prisma.netsisSyncRecord.findMany).not.toHaveBeenCalled();
    });

    it("hazırsa adayları sıralı ve sınırlı sorgular, yazar ve sayar", async () => {
      const { service, stub, prisma } = build();
      await stub.arps.create({ CariTemelBilgi: { CARI_KOD: RETAIL } });
      await expect(service.runPending(25)).resolves.toEqual({
        state: "ran",
        synced: 1,
        failed: 0,
      });
      expect(prisma.netsisSyncRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "asc" }, take: 25 }),
      );
    });
  });

  it("reportExhausted: kayıt başına tekilleştirilmiş admin alarmı", async () => {
    const { service, prisma, notifications } = build();
    prisma.netsisSyncRecord.findMany.mockResolvedValueOnce([
      {
        id: "rec-1",
        kind: "payout_transfer",
        sourceId: "p-1",
        idempotencyKey: "payout_transfer:p-1",
        lastError: "validation: TUTAR",
      },
    ] as never);
    await expect(service.reportExhausted()).resolves.toBe(1);
    expect(notifications.notifyAllAdminsOnce).toHaveBeenCalledWith(
      "netsis-sync-exhausted:rec-1",
      24 * 60 * 60,
      NotificationType.NETSIS_SYNC_EXHAUSTED,
      expect.objectContaining({
        recordId: "rec-1",
        kindLabel: "Satıcı ödemesi",
        sourceId: "p-1",
        reason: "validation: TUTAR",
        adminLink: expect.stringContaining("/system/invoicing-settings"),
      }),
    );
  });
});
