import * as ExcelJS from "exceljs";
import { ExportListService } from "../../../common/export";
import { translateMessage } from "../../i18n/translate";
import {
  AdminPayoutExportService,
  holdExportRecord,
  transferExportRecord,
} from "./admin-payout-export.service";
import { AdminPayoutService } from "./admin-payout.service";

/**
 * Satıcı ödemeleri dökümü = ekran: listeyle aynı süzgeç, arama ve sıralama.
 * Eski CSV aramayı ve sıralamayı yok sayıyor, 5000 satırda sessizce kesiyor,
 * denetim bırakmıyordu; Transferler sekmesinin düğmesi transfer durumlarını
 * hold dökümüne gönderip 400 alıyordu.
 */
const RELEASE_AT_REF = { __ref: "payment_holds.release_at" };

interface FindManyArgs {
  where: Record<string, unknown>;
  orderBy: unknown;
  skip?: number;
  take?: number;
}

const hold = (over: Record<string, unknown> = {}) => ({
  id: "h1",
  orderId: "o1",
  sellerId: "s1",
  amount: 100,
  refundedAmount: 25,
  frozenByRefundId: null,
  status: "released",
  releaseAt: new Date("2026-10-12T09:00:00.000Z"),
  releasedAt: new Date("2026-10-07T09:00:00.000Z"),
  createdAt: new Date("2026-09-01T21:30:00.000Z"),
  payment: { id: "p1", paidAt: null },
  seller: { id: "s1", displayName: "Satıcı", email: "s@x.com" },
  ...over,
});

const transfer = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  tradeCashPaymentId: null,
  amount: 100,
  netAmount: 90,
  adjustmentDeduction: 10,
  transferIban: "TR12 0006 1000 0000 1234 5678 90",
  status: "failed",
  failureReason: "IBAN hatalı",
  retryCount: 1,
  processedAt: null,
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
  seller: { id: "s1", displayName: null, email: "s@x.com" },
  paymentHold: { orderId: "o1" },
  ...over,
});

const pager = (rows: unknown[]) =>
  jest.fn(async (args: FindManyArgs) =>
    rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length)),
  );

function makeService(data: { holds?: unknown[]; transfers?: unknown[] } = {}) {
  const prisma = {
    paymentHold: {
      findMany: pager(data.holds ?? [hold()]),
      fields: { releaseAt: RELEASE_AT_REF },
    },
    payoutTransfer: { findMany: pager(data.transfers ?? [transfer()]) },
    order: {
      findMany: jest.fn().mockResolvedValue([
        // Liste satırı bırakılabilirlik bayrağını da türetir (HOLD_RELEASE_ORDER_SELECT).
        {
          id: "o1",
          orderNumber: "ORD-1",
          status: "completed",
          refundRequests: [],
        },
      ]),
    },
  };
  const audit = {
    createRequiredAuditLog: jest.fn().mockResolvedValue(undefined),
  };
  const payouts = new AdminPayoutService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never, // payoutCore
    {} as never, // scheduledQueue
  );
  const service = new AdminPayoutExportService(
    prisma as never,
    payouts,
    new ExportListService(audit as never),
  );
  return { service, prisma, audit };
}

const t = (key: string) => translateMessage(key, "tr");

describe("AdminPayoutExportService.exportHolds", () => {
  it("listenin süzgecini (erken bırakılanlar dahil) ve sıralamasını kullanır", async () => {
    const { service, prisma } = makeService();

    await service.exportHolds(
      {
        earlyReleased: true,
        status: "released",
        sortBy: "sellerName",
        sortOrder: "asc",
      },
      "admin-1",
      "tr",
    );

    const args = prisma.paymentHold.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      status: "released",
      releasedAt: { lt: RELEASE_AT_REF },
    });
    expect(args.orderBy).toEqual([
      { seller: { displayName: "asc" } },
      { id: "asc" },
    ]);
    expect(args).toMatchObject({ skip: 0, take: 500 });
  });

  it("aramayı listeyle aynı alanlara uygular (satıcı + sipariş no)", async () => {
    const { service, prisma } = makeService();

    await service.exportHolds({ search: "ORD-1" }, "admin-1", "tr");

    const { where } = prisma.paymentHold.findMany.mock.calls[0][0];
    expect(where.OR).toEqual(
      expect.arrayContaining([{ orderId: { in: ["o1"] } }]),
    );
  });

  it("bitiş tarihi Türkiye gününün SONUDUR — seçilen gün dahil", async () => {
    const { service, prisma } = makeService();

    await service.exportHolds(
      { dateFrom: "2026-10-01", dateTo: "2026-10-12" },
      "admin-1",
      "tr",
    );

    const { where } = prisma.paymentHold.findMany.mock.calls[0][0];
    expect(where.createdAt).toEqual({
      gte: new Date("2026-09-30T21:00:00.000Z"),
      lte: new Date("2026-10-12T20:59:59.999Z"),
    });
  });

  it("zorunlu denetim kaydı yazar; arama terimi yazılmaz", async () => {
    const { service, audit } = makeService();

    const file = await service.exportHolds(
      { search: "satici@ornek.com" },
      "admin-1",
      "tr",
    );

    expect(file.filename).toMatch(
      /^satici-odemeleri-escrow-\d{4}-\d{2}-\d{2}\.xlsx$/,
    );
    const [actor, action, entityType, , , payload] =
      audit.createRequiredAuditLog.mock.calls[0];
    expect([actor, action, entityType]).toEqual([
      "admin-1",
      "payout_holds_export",
      "PaymentHold",
    ]);
    expect(JSON.stringify(payload)).not.toContain("satici@ornek.com");
  });

  it("dosya Özet + Escrow sayfası; tutarlar sayı, tarihler İstanbul saatiyle", async () => {
    const { service } = makeService();

    const file = await service.exportHolds({}, "admin-1", "tr");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as never);

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Özet",
      "Escrow (Hold'lar)",
    ]);
    const row = workbook.worksheets[1].getRow(2);
    expect(row.getCell(1).value).toBe("ORD-1");
    expect(row.getCell(4).value).toBe(75); // net: 100 − 25
    expect(row.getCell(4).numFmt).toBe("#,##0.00 ₺");
    // createdAt 21:30Z = ertesi gün 00:30 İstanbul.
    expect(row.getCell(10).value).toEqual(new Date("2026-09-02T00:30:00.000Z"));
  });
});

describe("holdExportRecord", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "h1",
    orderId: "o1",
    orderNumber: "ORD-1",
    sellerId: "s1",
    sellerName: "Satıcı",
    sellerEmail: "s@x.com",
    amount: 100,
    refundedAmount: 25,
    frozenByRefundId: null,
    status: "released" as const,
    releaseAt: new Date("2026-10-12T09:00:00.000Z"),
    releasedAt: new Date("2026-10-07T09:00:00.000Z"),
    paidAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...over,
  });

  it("ekrandaki NET tutarı, iadeyi ayrı kolonda ve erken gün farkını yazar", () => {
    expect(holdExportRecord(row() as never, t)).toMatchObject({
      amount: 75,
      refundedAmount: 25,
      earlyReleaseDays: 5,
      status: "Serbest Bırakıldı",
    });
  });

  it("erken bırakılmadıysa gün boş; çözülemeyen sipariş no boş", () => {
    expect(
      holdExportRecord(
        row({
          orderNumber: "-",
          releasedAt: new Date("2026-10-13T09:00:00.000Z"),
        }) as never,
        t,
      ),
    ).toMatchObject({ orderNumber: null, earlyReleaseDays: null });
  });
});

describe("AdminPayoutExportService.exportTransfers", () => {
  it("'all' durum süzgeci koymaz, belirli durum koyar; liste sırasını izler", async () => {
    const { service, prisma } = makeService();

    await service.exportTransfers({ status: "all" }, "admin-1", "tr");
    await service.exportTransfers({ status: "failed" }, "admin-1", "tr");

    const [first, second] = prisma.payoutTransfer.findMany.mock.calls;
    expect(first[0].where.status).toBeUndefined();
    expect(second[0].where.status).toBe("failed");
    expect(first[0].orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
  });

  it("ayrı denetim eylemiyle yazar", async () => {
    const { service, audit } = makeService();

    const file = await service.exportTransfers({}, "admin-1", "tr");

    expect(file.filename).toMatch(/^satici-odemeleri-transferler-/);
    expect(audit.createRequiredAuditLog.mock.calls[0].slice(0, 3)).toEqual([
      "admin-1",
      "payout_transfers_export",
      "PayoutTransfer",
    ]);
  });
});

describe("transferExportRecord", () => {
  it("IBAN yalnız son 4 hane, durum etiketi ve satıcı adı yedeği", () => {
    expect(
      transferExportRecord(
        {
          id: "t1",
          orderId: "o1",
          orderNumber: "ORD-1",
          tradeCashPaymentId: null,
          seller: { id: "s1", displayName: null, email: "s@x.com" },
          amount: 100,
          netAmount: 90,
          adjustmentDeduction: 10,
          ibanLast4: "7890",
          status: "failed",
          failureReason: "IBAN hatalı",
          retryCount: 1,
          processedAt: null,
          createdAt: new Date("2026-10-01T09:00:00.000Z"),
        } as never,
        t,
      ),
    ).toMatchObject({
      sellerName: "s@x.com",
      netAmount: 90,
      ibanLast4: "••7890",
      status: "Başarısız",
      // Legacy free text stays as is.
      failureReason: "IBAN hatalı",
    });
  });

  it("bir sebep kodunu etiketiyle yazar", () => {
    expect(
      transferExportRecord(
        {
          id: "t1",
          orderId: "o1",
          orderNumber: "ORD-1",
          tradeCashPaymentId: null,
          seller: { id: "s1", displayName: "Satıcı", email: "s@x.com" },
          amount: 100,
          netAmount: 90,
          adjustmentDeduction: 0,
          ibanLast4: "7890",
          status: "failed",
          failureReason: "transfer_needs_manual_decision",
          retryCount: 0,
          processedAt: null,
          createdAt: new Date("2026-10-01T09:00:00.000Z"),
        } as never,
        t,
      ).failureReason,
    ).toBe("Manuel karar gerekiyor");
  });
});
