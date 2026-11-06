import { Prisma, type InstallmentRule } from "@prisma/client";
import { AdminInstallmentsService } from "./admin-installments.service";

const rule = (overrides: Partial<InstallmentRule> = {}): InstallmentRule => ({
  id: "rule-2",
  lineageId: "rule-1",
  version: 2,
  name: "Premium",
  segment: "premium",
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: new Prisma.Decimal(100),
  priority: 0,
  validFrom: new Date("2026-11-01T00:00:00Z"),
  validUntil: null,
  createdBy: "admin-row-1",
  createdAt: new Date("2026-11-02T00:00:00Z"),
  archivedAt: null,
  archivedBy: null,
  ...overrides,
});

function setup() {
  const tx = { marker: "tx" };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
  };
  const audit = {
    resolveActiveAdminId: jest.fn(async () => "admin-row-1"),
    createRequiredAuditLog: jest.fn(async () => undefined),
  };
  const settings = {
    read: jest.fn(async () => ({
      enabled: true,
      minAmount: new Prisma.Decimal(750),
    })),
    update: jest.fn(async () => [
      {
        settingKey: "installments_enabled",
        settingId: "setting-1",
        before: null,
        after: "true",
      },
    ]),
  };
  const rates = {
    latest: jest.fn(async () => ({
      id: "snap-1",
      fetchedAt: new Date(Date.now() - 60_000),
      singleRatePct: new Prisma.Decimal(3),
      maxInstallmentNonBusiness: 9,
      rates: { world: {}, bonus: {}, unknown: {} },
    })),
  };
  const rules = {
    list: jest.fn(async () => []),
    create: jest.fn(async () => ({
      before: null,
      rule: rule({ id: "rule-1", version: 1 }),
      overlaps: [],
    })),
    createVersion: jest.fn(async () => ({
      before: rule({
        id: "rule-1",
        version: 1,
        archivedAt: new Date(),
        archivedBy: "admin-row-1",
      }),
      rule: rule(),
      overlaps: [{ id: "x", lineageId: "x", version: 1, name: "All" }],
    })),
    archive: jest.fn(async () => ({
      before: rule(),
      rule: rule({
        archivedAt: new Date("2026-11-03T00:00:00Z"),
        archivedBy: "admin-row-1",
      }),
      overlaps: [],
    })),
    preview: jest.fn(async () => ({ rows: [] })),
  };
  const service = new AdminInstallmentsService(
    prisma as never,
    audit as never,
    settings as never,
    rates as never,
    rules as never,
  );
  return { service, prisma, audit, settings, rules, tx };
}

const INPUT = {
  name: "Premium",
  segment: "premium" as const,
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: 100,
  priority: 0,
  validFrom: "2026-11-01T00:00:00.000Z",
};

describe("AdminInstallmentsService", () => {
  it("writes a setting change and its required audit row in one transaction", async () => {
    const { service, audit, settings, tx } = setup();
    const answer = await service.updateSettings("user-1", { enabled: true });
    expect(settings.update).toHaveBeenCalledWith(
      tx,
      { enabled: true },
      "admin-row-1",
    );
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "user-1",
      "installment_setting_update",
      "platform_setting",
      "setting-1",
      { settingKey: "installments_enabled", value: null },
      { settingKey: "installments_enabled", value: "true" },
      tx,
    );
    expect(answer).toMatchObject({
      enabled: true,
      minAmount: 750,
      rates: {
        rateSnapshotId: "snap-1",
        fresh: true,
        maxInstallmentNonBusiness: 9,
        families: ["bonus", "world"],
      },
    });
  });

  it("writes no audit row when nothing changed", async () => {
    const { service, audit, settings } = setup();
    settings.update.mockResolvedValueOnce([]);
    await service.updateSettings("user-1", { enabled: true });
    expect(audit.createRequiredAuditLog).not.toHaveBeenCalled();
  });

  it("audits a rule create with the admin row as author", async () => {
    const { service, audit, rules, tx } = setup();
    const answer = await service.createRule("user-1", INPUT);
    expect(rules.create).toHaveBeenCalledWith(tx, INPUT, "admin-row-1");
    expect(audit.createRequiredAuditLog).toHaveBeenCalledWith(
      "user-1",
      "installment_rule_create",
      "installment_rule",
      "rule-1",
      null,
      expect.objectContaining({
        id: "rule-1",
        version: 1,
        platformSharePct: "100",
      }),
      tx,
    );
    expect(answer.rule).toMatchObject({
      id: "rule-1",
      status: expect.any(String),
    });
  });

  it("audits a new version with the archived old version as the old value and returns the overlaps", async () => {
    const { service, audit } = setup();
    const answer = await service.createRuleVersion("user-1", "rule-1", INPUT);
    const call = audit.createRequiredAuditLog.mock.calls[0] as unknown[];
    expect(call[1]).toBe("installment_rule_version");
    expect(call[3]).toBe("rule-2");
    expect(call[4]).toMatchObject({ id: "rule-1", archivedBy: "admin-row-1" });
    expect(call[5]).toMatchObject({
      id: "rule-2",
      lineageId: "rule-1",
      version: 2,
    });
    expect(answer.overlaps).toHaveLength(1);
  });

  it("audits an archive", async () => {
    const { service, audit } = setup();
    const answer = await service.archiveRule("user-1", "rule-2");
    const call = audit.createRequiredAuditLog.mock.calls[0] as unknown[];
    expect(call[1]).toBe("installment_rule_archive");
    expect(call[4]).toMatchObject({ archivedAt: null });
    expect(call[5]).toMatchObject({ archivedAt: "2026-11-03T00:00:00.000Z" });
    expect(answer.rule.status).toBe("archived");
  });

  it("propagates a failed audit so the transaction rolls the change back", async () => {
    const { service, audit } = setup();
    audit.createRequiredAuditLog.mockRejectedValueOnce(new Error("audit down"));
    await expect(service.createRule("user-1", INPUT)).rejects.toThrow(
      "audit down",
    );
  });

  it("maps the preview draft fields with their defaults", async () => {
    const { service, rules } = setup();
    await service.preview({
      segment: "premium",
      amount: 1000,
      family: "world",
      draftMinCount: 4,
    });
    expect(rules.preview).toHaveBeenCalledWith({
      segment: "premium",
      amount: 1000,
      family: "world",
      replacesRuleId: undefined,
      draft: {
        segment: "premium",
        minCount: 4,
        maxCount: 4,
        allowed: true,
        platformSharePct: 0,
        priority: 0,
      },
    });
    await service.preview({
      segment: "premium",
      amount: 1000,
      family: "world",
    });
    expect(rules.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ draft: undefined }),
    );
  });
});
