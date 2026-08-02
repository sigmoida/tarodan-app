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

function makePrisma() {
  return {
    paytrStatementLine: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    paytrSettlement: {
      upsert: jest.fn().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: `stl-${create.datePaid.toISOString().slice(0, 10)}`,
        }),
      ),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    paytrSettlementItem: {
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function makeService(opts: {
  prisma?: any;
  enabled?: boolean;
  statement?: any[];
  summary?: any[];
  detail?: any[];
}) {
  const prisma = opts.prisma ?? makePrisma();
  const getTransactionStatement = jest
    .fn()
    .mockResolvedValue(opts.statement ?? []);
  const getSettlementSummary = jest.fn().mockResolvedValue(opts.summary ?? []);
  const getSettlementDetail = jest.fn().mockResolvedValue(opts.detail ?? []);
  const service = new PaytrReportSyncService(
    prisma as any,
    {
      resolve: () => ({
        getTransactionStatement,
        getSettlementSummary,
        getSettlementDetail,
      }),
    } as any,
    {
      get: jest.fn((key: string) =>
        key === "PAYTR_REPORT_SYNC_ENABLED" && opts.enabled !== false
          ? "true"
          : undefined,
      ),
    } as any,
  );
  return {
    service,
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

  it("skips the detail call when the settlement already has items", async () => {
    const prisma = makePrisma();
    prisma.paytrSettlementItem.count = jest.fn().mockResolvedValue(2);
    const { service, getSettlementDetail } = makeService({
      prisma,
      summary: [REALIZED],
    });

    const r = await service.syncSettlements();

    expect(getSettlementDetail).not.toHaveBeenCalled();
    expect(r.itemsFetchedFor).toBe(0);
  });

  it("replaces projections wholesale on every sync", async () => {
    const { service, prisma, getSettlementDetail } = makeService({
      summary: [PROJECTION],
    });

    await service.syncSettlements();

    // Projeksiyonlar her turda sil-yaz — PayTR her gün günceller, bayat satır kalmasın.
    expect(prisma.paytrSettlement.deleteMany).toHaveBeenCalledWith({
      where: { isProjection: true },
    });
    expect(prisma.paytrSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isProjection: true, netTotal: 97 }),
      }),
    );
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
