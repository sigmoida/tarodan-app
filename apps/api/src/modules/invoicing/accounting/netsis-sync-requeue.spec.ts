import { NETSIS_ACCOUNTING_SETTING_KEYS } from "./netsis-accounting-settings";
import {
  parseNetsisSyncRequeueArgs,
  requeueSkippedNetsisSync,
} from "./netsis-sync-requeue";

const A = NETSIS_ACCOUNTING_SETTING_KEYS;

describe("netsis-sync-requeue", () => {
  const originalProvider = process.env.INVOICE_PROVIDER;
  beforeEach(() => {
    process.env.INVOICE_PROVIDER = "netsis";
  });
  afterEach(() => {
    if (originalProvider === undefined) delete process.env.INVOICE_PROVIDER;
    else process.env.INVOICE_PROVIDER = originalProvider;
  });

  describe("parseNetsisSyncRequeueArgs", () => {
    it("--since zorunlu; TR gününün başından itibaren", () => {
      expect(() => parseNetsisSyncRequeueArgs(["node", "x"])).toThrow(
        "--since",
      );
      expect(() =>
        parseNetsisSyncRequeueArgs(["--since", "01.11.2026"]),
      ).toThrow("--since");
      expect(
        parseNetsisSyncRequeueArgs(["--since", "2026-11-01"]),
      ).toEqual({
        since: new Date("2026-10-31T21:00:00Z"),
        dryRun: false,
      });
    });

    it("--kind ve --dry-run", () => {
      expect(
        parseNetsisSyncRequeueArgs([
          "--since",
          "2026-11-01",
          "--kind",
          "payout_transfer",
          "--dry-run",
        ]),
      ).toMatchObject({ kind: "payout_transfer", dryRun: true });
      expect(() =>
        parseNetsisSyncRequeueArgs(["--since", "2026-11-01", "--kind", "x"]),
      ).toThrow("--kind");
    });
  });

  describe("requeueSkippedNetsisSync", () => {
    const build = (settings: Record<string, string>) => {
      const prisma = {
        platformSetting: {
          findMany: jest.fn().mockResolvedValue(
            Object.entries(settings).map(([settingKey, settingValue]) => ({
              settingKey,
              settingValue,
            })),
          ),
        },
        netsisSyncRecord: {
          groupBy: jest
            .fn()
            .mockResolvedValue([
              { kind: "payout_transfer", _count: { _all: 4 } },
            ]),
          updateMany: jest.fn().mockResolvedValue({ count: 4 }),
        },
      };
      return prisma;
    };
    const since = new Date("2026-10-31T21:00:00Z");

    it("senkron kapalıysa hiçbir şeye dokunmaz", async () => {
      const prisma = build({ [A.enabled]: "false" });
      await expect(
        requeueSkippedNetsisSync(prisma as never, { since, dryRun: false }),
      ).rejects.toThrow("Senkron kapalı");
      expect(prisma.netsisSyncRecord.updateMany).not.toHaveBeenCalled();
    });

    it("yalnız tarihten sonraki SKIPPED satırları pending'e çeker, bütçeyi sıfırlar", async () => {
      const prisma = build({
        [A.enabled]: "true",
        [A.paytrClearing]: "102.99",
        [A.mainBank]: "102.01",
      });
      const result = await requeueSkippedNetsisSync(prisma as never, {
        since,
        kind: "payout_transfer",
        dryRun: false,
      });
      expect(prisma.netsisSyncRecord.updateMany).toHaveBeenCalledWith({
        where: {
          status: "skipped",
          createdAt: { gte: since },
          kind: "payout_transfer",
        },
        data: {
          status: "pending",
          attemptCount: 0,
          lastAttemptAt: null,
          lastError: null,
        },
      });
      expect(result).toEqual({
        byKind: [{ kind: "payout_transfer", count: 4 }],
        requeued: 4,
        blockers: [],
      });
    });

    it("dry-run yazmaz; eksik hesaplar uyarı olarak döner", async () => {
      const prisma = build({ [A.enabled]: "true" });
      const result = await requeueSkippedNetsisSync(prisma as never, {
        since,
        dryRun: true,
      });
      expect(prisma.netsisSyncRecord.updateMany).not.toHaveBeenCalled();
      expect(result.requeued).toBe(0);
      expect(result.blockers).toEqual([A.paytrClearing, A.mainBank]);
    });
  });
});
