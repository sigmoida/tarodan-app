import { PaytrMerchant } from "@prisma/client";
import { PaytrReportSyncService } from "./paytr-report-sync.service";

/**
 * PayTR rapor senkronu (Faz 2): işlem dökümü satırları ve hakediş (settlement)
 * kayıtları idempotent upsert ile yerelde saklanır — admin finans/mutabakat
 * ekranları PayTR'ye canlı sorgu atmaz, bu tablolardan okur.
 *
 * Kurallar:
 *  - PAYTR_REPORT_SYNC_ENABLED=true değilse HİÇBİR sorgu atılmaz (rapor uçları
 *    panelde ayrı yetki isteyebilir; yetkisiz ortamda cron alarm üretmesin).
 *  - Dökümde dedup anahtarı (merchantOid+type+transactionDate+amount) — pencere
 *    kaydırmalı sync aynı satırı iki kez yazamaz.
 *  - Hakediş kalemleri yalnız kalemi OLMAYAN gerçekleşmiş hakediş için çekilir
 *    (odeme-detayi ekstra bir istek; her turda tekrarlanmaz).
 *  - future_payments projeksiyonları her turda SİL-YAZ (PayTR her gün günceller).
 */

function makePrisma(opts: { itemsSyncedAt?: Date | null } = {}) {
  const prisma: any = {
    // Projeksiyon sil-yaz tek işlemde: tx istemcisi = aynı mock.
    $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
    paytrStatementLine: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    paytrSettlement: {
      upsert: jest.fn().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: `stl-${create.datePaid.toISOString().slice(0, 10)}`,
          itemsSyncedAt: opts.itemsSyncedAt ?? null,
        }),
      ),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    paytrSettlementItem: {
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  return prisma;
}

const MARKETPLACE_ENV = {
  PAYTR_MERCHANT_ID: "111",
  PAYTR_MERCHANT_KEY: "k",
  PAYTR_MERCHANT_SALT: "s",
};
const MEMBERSHIP_ENV = {
  PAYTR_MEMBERSHIP_MERCHANT_ID: "222",
  PAYTR_MEMBERSHIP_MERCHANT_KEY: "mk",
  PAYTR_MEMBERSHIP_MERCHANT_SALT: "ms",
};

function makeService(opts: {
  prisma?: any;
  enabled?: boolean;
  statement?: any[];
  summary?: any[];
  detail?: any[];
  /** Kimliği tanımlı mağazaların env'i (varsayılan: yalnız pazaryeri). */
  env?: Record<string, string>;
}) {
  const prisma = opts.prisma ?? makePrisma();
  const getTransactionStatement = jest
    .fn()
    .mockResolvedValue(opts.statement ?? []);
  const getSettlementSummary = jest.fn().mockResolvedValue(opts.summary ?? []);
  const getSettlementDetail = jest.fn().mockResolvedValue(opts.detail ?? []);
  const resolve = jest.fn(() => ({
    getTransactionStatement,
    getSettlementSummary,
    getSettlementDetail,
  }));
  const env: Record<string, string> = opts.env ?? MARKETPLACE_ENV;
  const service = new PaytrReportSyncService(
    prisma as any,
    { resolve } as any,
    {
      get: jest.fn((key: string) =>
        key === "PAYTR_REPORT_SYNC_ENABLED"
          ? opts.enabled !== false
            ? "true"
            : undefined
          : env[key],
      ),
    } as any,
  );
  return {
    service,
    resolve,
    prisma,
    getTransactionStatement,
    getSettlementSummary,
    getSettlementDetail,
  };
}

const SALE = {
  type: "sale",
  merchantOid: "ORD1",
  amountTl: 100,
  feeTl: 2.35,
  feeRatePct: 2.35,
  netTl: 97.65,
  currency: "TL",
  installment: 0,
  cardBrand: "WORLD",
  maskedPan: "455359AAA6747",
  paymentType: "KART",
  transactionDate: "2026-07-31",
  raw: { siparis_no: "ORD1" },
};

describe("PaytrReportSyncService.syncTransactionStatement", () => {
  it("does nothing when the flag is off", async () => {
    const { service, getTransactionStatement, prisma } = makeService({
      enabled: false,
    });

    const r = await service.syncTransactionStatement();

    expect(getTransactionStatement).not.toHaveBeenCalled();
    expect(prisma.paytrStatementLine.upsert).not.toHaveBeenCalled();
    expect(r).toEqual({ fetched: 0, upserted: 0 });
  });

  it("skips a row with an unparseable transaction date instead of failing the sync", async () => {
    // PayTR bir satırda islem_tarihi'ni boş/formatsız dönerse Invalid Date
    // Prisma'da throw eder ve TÜM gece sync'i boşa giderdi — satır atlanır.
    const { service, prisma } = makeService({
      statement: [{ ...SALE, transactionDate: "" }, SALE],
    });

    const r = await service.syncTransactionStatement();

    expect(r).toEqual({ fetched: 2, upserted: 1 });
    expect(prisma.paytrStatementLine.upsert).toHaveBeenCalledTimes(1);
  });

  it("upserts each row with the dedup key (idempotent window sync)", async () => {
    const { service, prisma } = makeService({
      statement: [SALE, { ...SALE, type: "refund", amountTl: 50, feeTl: null }],
    });

    const r = await service.syncTransactionStatement();

    expect(r).toEqual({ fetched: 2, upserted: 2 });
    expect(prisma.paytrStatementLine.upsert).toHaveBeenCalledTimes(2);
    const first = prisma.paytrStatementLine.upsert.mock.calls[0][0];
    // Dedup: aynı satır ikinci sync'te yeni kayıt AÇMAMALI.
    expect(first.where.statement_line_dedup).toMatchObject({
      paytrMerchant: PaytrMerchant.marketplace,
      merchantOid: "ORD1",
      type: "sale",
      amount: 100,
    });
    expect(first.where.statement_line_dedup.transactionDate).toBeInstanceOf(
      Date,
    );
    expect(first.create).toMatchObject({
      merchantOid: "ORD1",
      type: "sale",
      amount: 100,
      fee: 2.35,
      net: 97.65,
      currency: "TL",
      cardBrand: "WORLD",
    });
  });
});

describe("PaytrReportSyncService — per merchant", () => {
  it("syncs every configured merchant's statement and stamps the rows", async () => {
    const { service, prisma, resolve } = makeService({
      env: { ...MARKETPLACE_ENV, ...MEMBERSHIP_ENV },
      statement: [SALE],
    });

    const r = await service.syncTransactionStatement();

    expect(resolve).toHaveBeenCalledWith("paytr", PaytrMerchant.marketplace);
    expect(resolve).toHaveBeenCalledWith("paytr", PaytrMerchant.membership);
    expect(r).toEqual({ fetched: 2, upserted: 2 });
    const merchants = prisma.paytrStatementLine.upsert.mock.calls.map(
      ([arg]: any[]) => arg.create.paytrMerchant,
    );
    expect(merchants).toEqual([
      PaytrMerchant.marketplace,
      PaytrMerchant.membership,
    ]);
  });

  it("keeps syncing the other merchant when one merchant's report fails", async () => {
    // Yeni mağazada rapor yetkisi açılmamış olabilir: pazaryeri dökümü yine
    // yazılmalı ve çağıran (eşleştirme/kesinti) çalışmaya devam edebilmeli.
    const { service, prisma, getTransactionStatement } = makeService({
      env: { ...MARKETPLACE_ENV, ...MEMBERSHIP_ENV },
      statement: [SALE],
    });
    getTransactionStatement
      .mockResolvedValueOnce([SALE])
      .mockRejectedValueOnce(new Error("yetkisiz"));

    const r = await service.syncTransactionStatement();

    expect(r).toEqual({
      fetched: 1,
      upserted: 1,
      failedMerchants: [PaytrMerchant.membership],
    });
    expect(prisma.paytrStatementLine.upsert).toHaveBeenCalledTimes(1);
  });

  it("throws when every configured merchant's report fails", async () => {
    const { service, getSettlementSummary } = makeService({
      env: { ...MARKETPLACE_ENV, ...MEMBERSHIP_ENV },
    });
    getSettlementSummary.mockRejectedValue(new Error("down"));

    await expect(service.syncSettlements()).rejects.toThrow("down");
  });

  it("skips a merchant whose credentials are not configured", async () => {
    const { service, resolve } = makeService({ env: MARKETPLACE_ENV });
    await service.syncSettlements();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("paytr", PaytrMerchant.marketplace);
  });

  it("replaces only the syncing merchant's projections", async () => {
    const { service, prisma } = makeService({
      env: { ...MARKETPLACE_ENV, ...MEMBERSHIP_ENV },
      summary: [],
    });
    await service.syncSettlements();
    expect(prisma.paytrSettlement.deleteMany).toHaveBeenCalledWith({
      where: { paytrMerchant: PaytrMerchant.membership, isProjection: true },
    });
  });
});

describe("PaytrReportSyncService.syncSettlements", () => {
  const REALIZED = {
    datePaid: "2026-07-30",
    currency: "TL",
    salesTl: 950.95,
    returnsTl: 12.64,
    netTl: 938.31,
    merchantIban: "TR000000000000000000000001",
    projection: false,
    raw: {},
  };
  const PROJECTION = {
    datePaid: "2026-08-02",
    currency: "TL",
    salesTl: 100,
    returnsTl: 0,
    netTl: 97,
    projection: true,
    raw: {},
  };

  it("upserts realized settlements and fetches detail items only when missing", async () => {
    const { service, prisma, getSettlementDetail } = makeService({
      summary: [REALIZED],
      detail: [
        { merchantOid: "OID1", amountTl: 900, currency: "TL", raw: {} },
        { merchantOid: "OID2", amountTl: 38.31, currency: "TL", raw: {} },
      ],
    });

    const r = await service.syncSettlements();

    expect(prisma.paytrSettlement.upsert).toHaveBeenCalledTimes(1);
    expect(getSettlementDetail).toHaveBeenCalledWith({ date: "2026-07-30" });
    expect(prisma.paytrSettlementItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ merchantOid: "OID1", amount: 900 }),
        ]),
      }),
    );
    expect(r.settlements).toBe(1);
    expect(r.itemsFetchedFor).toBe(1);
  });

  it("skips the detail call when the settlement's items were already synced", async () => {
    const prisma = makePrisma({
      itemsSyncedAt: new Date("2026-07-31T02:00:00Z"),
    });
    const { service, getSettlementDetail } = makeService({
      prisma,
      summary: [REALIZED],
    });

    const r = await service.syncSettlements();

    expect(getSettlementDetail).not.toHaveBeenCalled();
    expect(r.itemsFetchedFor).toBe(0);
  });

  it("stamps itemsSyncedAt even when PayTR returns no detail rows (no nightly re-fetch loop)", async () => {
    // Eski kod kalem sayısına bakıyordu: boş detay dönen hakediş sonsuza dek
    // her gece yeniden istenirdi.
    const { service, prisma, getSettlementDetail } = makeService({
      summary: [REALIZED],
      detail: [],
    });

    await service.syncSettlements();

    expect(getSettlementDetail).toHaveBeenCalledTimes(1);
    expect(prisma.paytrSettlementItem.createMany).not.toHaveBeenCalled();
    expect(prisma.paytrSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { itemsSyncedAt: expect.any(Date) },
      }),
    );
  });

  it("replaces projections wholesale on every sync", async () => {
    const { service, prisma, getSettlementDetail } = makeService({
      summary: [PROJECTION],
    });

    await service.syncSettlements();

    // Projeksiyonlar her turda sil-yaz — PayTR her gün günceller, bayat satır kalmasın.
    // Tek işlem içinde: ortada çökerse tablo boş kalmaz.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.paytrSettlement.deleteMany).toHaveBeenCalledWith({
      where: { paytrMerchant: PaytrMerchant.marketplace, isProjection: true },
    });
    expect(prisma.paytrSettlement.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ isProjection: true, netTotal: 97 })],
    });
    // Projeksiyonun detayı yoktur — odeme-detayi çağrılmaz.
    expect(getSettlementDetail).not.toHaveBeenCalled();
  });

  it("does nothing when the flag is off", async () => {
    const { service, getSettlementSummary } = makeService({
      enabled: false,
      summary: [REALIZED],
    });

    const r = await service.syncSettlements();

    expect(getSettlementSummary).not.toHaveBeenCalled();
    expect(r).toEqual({ settlements: 0, itemsFetchedFor: 0 });
  });
});
