import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PUBLIC_TIMING_RULE_IDS, TIMING_RULES } from "@tarodan/types";
import { withActionUnavailable } from "../../common/timing-rules/timing-rules.test-helpers";
import {
  TIMING_RULES_WRITE_ATTEMPTS,
  TimingRulesService,
} from "./timing-rules.service";

/** Bellek içi PlatformSetting tablosu — servisin okuduğu/yazdığı tek yüzey. */
function makeStore(initial: Record<string, string> = {}) {
  const rows = new Map<
    string,
    { settingKey: string; settingValue: string; updatedAt: Date }
  >(
    Object.entries(initial).map(([settingKey, settingValue]) => [
      settingKey,
      { settingKey, settingValue, updatedAt: new Date("2026-10-01") },
    ]),
  );
  const prisma: any = {
    platformSetting: {
      findMany: jest.fn(
        async ({ where }: { where: { settingKey: { in: string[] } } }) =>
          [...rows.values()].filter((row) =>
            where.settingKey.in.includes(row.settingKey),
          ),
      ),
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = rows.get(where.settingKey);
        const next = {
          settingKey: where.settingKey,
          settingValue: existing ? update.settingValue : create.settingValue,
          updatedAt: new Date("2026-10-05"),
        };
        rows.set(where.settingKey, next);
        return next;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma, rows };
}

const makeService = (
  initial: Record<string, string> = {},
  env: Record<string, string> = {},
) => {
  const { prisma, rows } = makeStore(initial);
  const config = { get: (key: string) => env[key] };
  return {
    service: new TimingRulesService(prisma, config as any),
    prisma,
    rows,
  };
};

describe("TimingRulesService", () => {
  describe("listStates / publicPolicy", () => {
    it("admin değeri yokken env'i, o da yoksa varsayılanı raporlar", async () => {
      const { service } = makeService({}, { RETURN_WINDOW_DAYS: "20" });
      const states = await service.listStates();
      expect(states.find((s) => s.id === "returnWindowDays")).toMatchObject({
        value: 20,
        source: "env",
        action: "complete",
      });
      expect(states.find((s) => s.id === "offerExpiryHours")).toMatchObject({
        value: 24,
        source: "default",
        action: "expire",
      });
    });

    it("herkese açık politika yalnız açık kayıtları birimiyle döner", async () => {
      const { service } = makeService({ offer_expiry_hours: "12" });
      const policy = await service.publicPolicy();
      expect(Object.keys(policy).sort()).toEqual(
        [...PUBLIC_TIMING_RULE_IDS].sort(),
      );
      expect(policy.offerExpiryHours).toEqual({ value: 12, unit: "hours" });
      expect(policy.returnWindowDays).toEqual({ value: 14, unit: "days" });
      expect(policy).not.toHaveProperty("paymentFailTimeoutMinutes");
      expect(policy).not.toHaveProperty("shippedStaleAlertDays");
    });
  });

  describe("applyChanges", () => {
    const expectRejected = async (
      promise: Promise<unknown>,
      i18nKey: string,
    ) => {
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await promise.catch((error: BadRequestException) => {
        expect(error.getResponse()).toMatchObject({ i18nKey });
      });
    };

    it("geçerli değeri ve eylemi tek Serializable işlemde yazar, önce/sonra döner", async () => {
      const { service, prisma, rows } = makeService();

      const applied = await service.applyChanges(
        [{ id: "tradeResponseHours", value: 96, action: "cancel" }],
        "user-1",
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(rows.get("trade_response_deadline_hours")?.settingValue).toBe(
        "96",
      );
      expect(
        rows.get("trade_response_deadline_hours_on_expiry")?.settingValue,
      ).toBe("cancel");
      expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ updatedBy: "user-1" }),
        }),
      );
      expect(applied).toEqual([
        {
          id: "tradeResponseHours",
          before: expect.objectContaining({ value: 72, source: "default" }),
          after: expect.objectContaining({ value: 96, source: "setting" }),
        },
      ]);
    });

    it("ilan ömrü için otomatik yenileme eylemi artık kaydedilebilir", async () => {
      const { service, rows } = makeService();

      await service.applyChanges(
        [{ id: "listingTtlDays", action: "auto_renew" }],
        "user-1",
      );

      expect(rows.get("listing_ttl_days_on_expiry")?.settingValue).toBe(
        "auto_renew",
      );
    });

    it.each([
      [0, "server.admin.timingRules.belowMin"],
      [-3, "server.admin.timingRules.belowMin"],
      [2.5, "server.admin.timingRules.notInteger"],
      [9999, "server.admin.timingRules.aboveMax"],
    ])("akışı çökertecek %p değerini reddeder", async (value, key) => {
      const { service, prisma } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "tradeShippingDays", value }], "user-1"),
        key,
      );
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it("iade penceresini 14 günün altına indirmez", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "returnWindowDays", value: 13 }], "u"),
        "server.admin.timingRules.belowMin",
      );
    });

    it("payout grace ve takas hold 0 olamaz", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "payoutGraceDays", value: 0 }], "u"),
        "server.admin.timingRules.belowMin",
      );
      await expectRejected(
        service.applyChanges([{ id: "tradeHoldDays", value: 0 }], "u"),
        "server.admin.timingRules.belowMin",
      );
    });

    it("ödeme fail penceresi PayTR oturumuna (30 dk) inemez", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges(
          [{ id: "paymentFailTimeoutMinutes", value: 30 }],
          "u",
        ),
        "server.admin.timingRules.belowMin",
      );
    });

    it("emniyet supabını drop-off penceresinin altına indirmez", async () => {
      const { service, prisma } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "returnDropoffHardDays", value: 10 }], "u"),
        "server.admin.timingRules.invariant.dropoffHardNotBelowDropoff",
      );
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it("değişmez mevcut ADMIN değerine göre de denetlenir", async () => {
      // Emniyet supabı admin tarafından 15'e çekilmiş; drop-off 16 olamaz.
      const { service } = makeService({
        refund_return_dropoff_hard_days: "15",
      });
      await expectRejected(
        service.applyChanges([{ id: "returnDropoffDays", value: 16 }], "u"),
        "server.admin.timingRules.invariant.dropoffHardNotBelowDropoff",
      );
    });

    it("ilişkili iki alan aynı istekte birlikte değiştirilebilir", async () => {
      const { service, rows } = makeService();
      await service.applyChanges(
        [
          { id: "returnDropoffDays", value: 30 },
          { id: "returnDropoffHardDays", value: 40 },
        ],
        "u",
      );
      expect(rows.get("refund_return_dropoff_days")?.settingValue).toBe("30");
      expect(rows.get("refund_return_dropoff_hard_days")?.settingValue).toBe(
        "40",
      );
    });

    it("ilan uyarısı ilan ömrüne eşit ya da uzun olamaz", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "listingTtlDays", value: 7 }], "u"),
        "server.admin.timingRules.invariant.listingWarningBeforeTtl",
      );
    });

    it("hazırlık uyarısı hazırlık süresine eşit ya da uzun olamaz (saat ↔ gün)", async () => {
      const { service, prisma, rows } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "preparingDeadlineDays", value: 1 }], "u"),
        "server.admin.timingRules.invariant.preparingWarningBeforeDeadline",
      );
      await expectRejected(
        service.applyChanges(
          [{ id: "preparingWarningLeadHours", value: 72 }],
          "u",
        ),
        "server.admin.timingRules.invariant.preparingWarningBeforeDeadline",
      );
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();

      // Birlikte değiştirilince geçerli: 1 gün + 12 saatlik uyarı.
      await service.applyChanges(
        [
          { id: "preparingDeadlineDays", value: 1 },
          { id: "preparingWarningLeadHours", value: 12 },
        ],
        "u",
      );
      expect(rows.get("preparing_deadline_days")?.settingValue).toBe("1");
      expect(rows.get("preparing_warning_lead_hours")?.settingValue).toBe("12");
    });

    it("henüz açılmamış eylemi doğrudan gönderilse bile reddeder", async () => {
      const { service, prisma } = makeService();
      for (const [id, action] of [
        ["listingTtlDays", "auto_renew"],
        ["offerExpiryHours", "extend_once"],
        ["preparingDeadlineDays", "extend_once"],
      ] as const) {
        await withActionUnavailable(id, action, () =>
          expectRejected(
            service.applyChanges([{ id, action }], "u"),
            "server.admin.timingRules.actionUnavailable",
          ),
        );
      }
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it("hazırlık süresi için tek seferlik uzatma seçilebilir", async () => {
      const { service, rows } = makeService();
      await service.applyChanges(
        [{ id: "preparingDeadlineDays", action: "extend_once" }],
        "u",
      );
      expect(rows.get("preparing_deadline_days_on_expiry")?.settingValue).toBe(
        "extend_once",
      );
    });

    it("kayıtta tanımsız eylemi reddeder", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "tradeHoldDays", action: "expire" }], "u"),
        "server.admin.timingRules.actionNotAllowed",
      );
    });

    it("biri geçersizse hiçbiri yazılmaz", async () => {
      const { service, prisma } = makeService();
      await expectRejected(
        service.applyChanges(
          [
            { id: "offerExpiryHours", value: 48 },
            { id: "payoutGraceDays", value: 0 },
          ],
          "u",
        ),
        "server.admin.timingRules.belowMin",
      );
      expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    });

    it("bilinmeyen, tekrarlanan ve boş değişikliği reddeder", async () => {
      const { service } = makeService();
      await expectRejected(
        service.applyChanges([{ id: "nope", value: 3 }], "u"),
        "server.admin.timingRules.unknownRule",
      );
      await expectRejected(
        service.applyChanges(
          [
            { id: "offerExpiryHours", value: 12 },
            { id: "offerExpiryHours", value: 13 },
          ],
          "u",
        ),
        "server.admin.timingRules.duplicateRule",
      );
      await expectRejected(
        service.applyChanges([{ id: "offerExpiryHours" }], "u"),
        "server.admin.timingRules.emptyChange",
      );
      await expectRejected(
        service.applyChanges([], "u"),
        "server.admin.timingRules.emptyChange",
      );
    });

    it("sınırın kendisini kabul eder", async () => {
      const { service, rows } = makeService();
      await service.applyChanges(
        [
          {
            id: "returnWindowDays",
            value: TIMING_RULES.returnWindowDays.min,
          },
        ],
        "u",
      );
      expect(rows.get("return_window_days")?.settingValue).toBe("14");
    });
  });

  describe("işlem içi adım ve eşzamanlılık", () => {
    const conflict = () =>
      new Prisma.PrismaClientKnownRequestError("write conflict", {
        code: "P2034",
        clientVersion: "test",
      });

    it("afterWrite (denetim) yazmayla AYNI işlem istemcisini ve önce/sonra çiftini alır", async () => {
      const { service, prisma } = makeService();
      const afterWrite = jest.fn().mockResolvedValue(undefined);

      await service.applyChanges(
        [{ id: "offerExpiryHours", value: 48 }],
        "user-1",
        afterWrite,
      );

      expect(afterWrite).toHaveBeenCalledWith(prisma, [
        expect.objectContaining({
          id: "offerExpiryHours",
          before: expect.objectContaining({ value: 24 }),
          after: expect.objectContaining({ value: 48 }),
        }),
      ]);
    });

    it("afterWrite fırlatırsa hata yükselir (işlem geri alınır)", async () => {
      const { service } = makeService();
      await expect(
        service.applyChanges(
          [{ id: "offerExpiryHours", value: 48 }],
          "user-1",
          jest.fn().mockRejectedValue(new Error("audit down")),
        ),
      ).rejects.toThrow("audit down");
    });

    it("Serializable çakışmasında işlemi baştan dener", async () => {
      const { service, prisma, rows } = makeService();
      const run = prisma.$transaction.getMockImplementation();
      prisma.$transaction
        .mockRejectedValueOnce(conflict())
        .mockImplementation(run);

      await service.applyChanges(
        [{ id: "offerExpiryHours", value: 48 }],
        "user-1",
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(rows.get("offer_expiry_hours")?.settingValue).toBe("48");
    });

    it("denemeler tükenirse ham 500 değil, açık bir 409 döner", async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockRejectedValue(conflict());

      await expect(
        service.applyChanges([{ id: "offerExpiryHours", value: 48 }], "u"),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(
        TIMING_RULES_WRITE_ATTEMPTS,
      );
    });

    it("doğrulama hatası yeniden denenmez", async () => {
      const { service, prisma } = makeService();
      await expect(
        service.applyChanges([{ id: "payoutGraceDays", value: 0 }], "u"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
