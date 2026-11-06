import { Prisma, type InstallmentRule } from "@prisma/client";
import type { InstallmentRuleInput } from "@tarodan/types";
import {
  DRAFT_RULE_ID,
  InstallmentRulesService,
} from "./installment-rules.service";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const NOW = new Date("2026-11-10T12:00:00Z");

const INPUT: InstallmentRuleInput = {
  name: "Premium 3 taksit vade farksız",
  segment: "premium",
  minCount: 2,
  maxCount: 3,
  allowed: true,
  platformSharePct: 100,
  priority: 0,
  validFrom: "2026-11-01T00:00:00.000Z",
  validUntil: null,
};

function row(overrides: Partial<InstallmentRule> = {}): InstallmentRule {
  return {
    id: "rule-1",
    lineageId: "rule-1",
    version: 1,
    name: INPUT.name,
    segment: "premium",
    minCount: 2,
    maxCount: 3,
    allowed: true,
    platformSharePct: D(100),
    priority: 0,
    validFrom: new Date("2026-11-01T00:00:00Z"),
    validUntil: null,
    createdBy: "admin-0",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    archivedAt: null,
    archivedBy: null,
    ...overrides,
  };
}

function makeTx(
  opts: {
    current?: InstallmentRule | null;
    archiveCount?: number;
    others?: InstallmentRule[];
  } = {},
) {
  return {
    $queryRaw: jest.fn(async () => []),
    installmentRule: {
      findUnique: jest.fn(async () =>
        opts.current === undefined ? row() : opts.current,
      ),
      updateMany: jest.fn(async () => ({ count: opts.archiveCount ?? 1 })),
      aggregate: jest.fn(async () => ({
        _max: { version: opts.current?.version ?? 1 },
      })),
      create: jest.fn(async ({ data }: { data: Partial<InstallmentRule> }) =>
        row({ ...data, id: data.id ?? "rule-2", createdAt: NOW }),
      ),
      findMany: jest.fn(async () => opts.others ?? []),
    },
  };
}

function service(
  rates: unknown = { latest: jest.fn(async () => null) },
  live: unknown[] = [],
) {
  const prisma = { installmentRule: { findMany: jest.fn(async () => live) } };
  return new InstallmentRulesService(prisma as never, rates as never);
}

describe("InstallmentRulesService writes", () => {
  it("creates version 1 whose lineage is its own id, by the admin", async () => {
    const tx = makeTx();
    const write = await service().create(tx as never, INPUT, "admin-1");
    const data = tx.installmentRule.create.mock.calls[0][0].data;
    expect(data.version).toBe(1);
    expect(data.lineageId).toBe(data.id);
    expect(data.createdBy).toBe("admin-1");
    expect(String(data.platformSharePct)).toBe("100");
    expect(write.before).toBeNull();
  });

  it.each`
    case                         | patch                                         | key
    ${"an empty name"}           | ${{ name: "  " }}                             | ${"nameRequired"}
    ${"count 1"}                 | ${{ minCount: 1 }}                            | ${"countRange"}
    ${"min above max"}           | ${{ minCount: 5, maxCount: 4 }}               | ${"countRange"}
    ${"count 13"}                | ${{ maxCount: 13 }}                           | ${"countRange"}
    ${"a share above 100"}       | ${{ platformSharePct: 100.5 }}                | ${"shareRange"}
    ${"a share with 3 decimals"} | ${{ platformSharePct: 12.345 }}               | ${"sharePrecision"}
    ${"a share on a disallow"}   | ${{ allowed: false, platformSharePct: 10 }}   | ${"shareWithoutAllowed"}
    ${"an end before the start"} | ${{ validUntil: "2026-10-01T00:00:00.000Z" }} | ${"validUntilNotAfterFrom"}
    ${"a priority out of range"} | ${{ priority: 1001 }}                         | ${"priorityRange"}
  `(
    "refuses $case with 400 $key and writes nothing",
    async ({ patch, key }) => {
      const tx = makeTx();
      await expect(
        service().create(tx as never, { ...INPUT, ...patch }, "admin-1"),
      ).rejects.toMatchObject({
        status: 400,
        response: { i18nKey: `server.admin.installments.rule.${key}` },
      });
      expect(tx.installmentRule.create).not.toHaveBeenCalled();
    },
  );

  it("edits by locking the current version, archiving it and inserting version + 1", async () => {
    const tx = makeTx({
      current: row({ version: 2, id: "rule-v2", lineageId: "rule-1" }),
    });
    const write = await service().createVersion(
      tx as never,
      "rule-v2",
      { ...INPUT, platformSharePct: 50 },
      "admin-1",
    );
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.installmentRule.updateMany).toHaveBeenCalledWith({
      where: { id: "rule-v2", archivedAt: null },
      data: { archivedAt: expect.any(Date), archivedBy: "admin-1" },
    });
    const data = tx.installmentRule.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      lineageId: "rule-1",
      version: 3,
      createdBy: "admin-1",
    });
    expect(String(data.platformSharePct)).toBe("50");
    expect(write.before).toMatchObject({
      id: "rule-v2",
      archivedBy: "admin-1",
    });
    // Archive happens before the insert (one live version per lineage).
    expect(
      tx.installmentRule.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.installmentRule.create.mock.invocationCallOrder[0]);
  });

  it("answers 404 for an unknown version and 409 for one that is no longer current", async () => {
    await expect(
      service().createVersion(
        makeTx({ current: null }) as never,
        "x",
        INPUT,
        "admin-1",
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service().createVersion(
        makeTx({ current: row({ archivedAt: NOW }) }) as never,
        "rule-1",
        INPUT,
        "admin-1",
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { i18nKey: "server.admin.installments.rule.notCurrent" },
    });
  });

  it("answers 409 when a concurrent edit archived the version first (CAS)", async () => {
    const tx = makeTx({ archiveCount: 0 });
    await expect(
      service().archive(tx as never, "rule-1", "admin-1"),
    ).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      service().createVersion(
        makeTx({ archiveCount: 0 }) as never,
        "rule-1",
        INPUT,
        "admin-1",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("archives without inserting anything", async () => {
    const tx = makeTx();
    const write = await service().archive(tx as never, "rule-1", "admin-1");
    expect(tx.installmentRule.create).not.toHaveBeenCalled();
    expect(write.rule.archivedBy).toBe("admin-1");
    expect(write.before?.archivedAt).toBeNull();
  });

  it("warns about overlapping current versions of other rules with the same priority", async () => {
    const overlapping = row({
      id: "other-1",
      lineageId: "other-1",
      name: "All 2-6",
      segment: "all",
      minCount: 2,
      maxCount: 6,
    });
    const otherPriority = row({
      id: "other-2",
      lineageId: "other-2",
      priority: 5,
    });
    const otherSegment = row({
      id: "other-3",
      lineageId: "other-3",
      segment: "free",
    });
    const tx = makeTx({ others: [overlapping, otherPriority, otherSegment] });
    const write = await service().create(tx as never, INPUT, "admin-1");
    expect(tx.installmentRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null, NOT: { lineageId: expect.any(String) } },
      }),
    );
    expect(write.overlaps).toEqual([
      { id: "other-1", lineageId: "other-1", version: 1, name: "All 2-6" },
    ]);
  });
});

describe("InstallmentRulesService.preview", () => {
  const snapshot = {
    id: "snap-1",
    fetchedAt: new Date("2026-11-10T03:30:00Z"),
    singleRatePct: D("3"),
    maxInstallmentNonBusiness: 6,
    rates: { world: { "3": "8", "6": "13" } },
  };
  const rates = { latest: jest.fn(async () => snapshot) };

  it("prices every count of the family with the live rules (plan 4.4 numbers)", async () => {
    const live = [
      {
        id: "rule-1",
        segment: "premium",
        minCount: 2,
        maxCount: 3,
        allowed: true,
        platformSharePct: D(100),
        priority: 0,
        validFrom: new Date("2026-11-01T00:00:00Z"),
        validUntil: null,
        archivedAt: null,
        createdAt: new Date("2026-11-01T00:00:00Z"),
      },
    ];
    const preview = await service(rates, live).preview(
      { segment: "premium", amount: 1000, family: "world" },
      NOW,
    );
    expect(preview).toEqual({
      segment: "premium",
      family: "world",
      baseAmount: 1000,
      rateSnapshotId: "snap-1",
      fetchedAt: "2026-11-10T03:30:00.000Z",
      rows: [
        {
          count: 3,
          offered: true,
          totalAmount: 1000,
          feeAmount: 0,
          monthlyAmount: 333.33,
          platformCostAmount: 50,
          platformSharePct: 100,
          ruleId: "rule-1",
        },
        {
          count: 6,
          offered: true,
          totalAmount: 1142.22,
          feeAmount: 142.22,
          monthlyAmount: 190.37,
          platformCostAmount: 0,
          platformSharePct: 0,
          ruleId: null,
        },
      ],
    });
  });

  it("prices a draft as live and newest, and leaves out the version it replaces", async () => {
    const live = [
      {
        id: "rule-1",
        segment: "premium",
        minCount: 2,
        maxCount: 6,
        allowed: false,
        platformSharePct: D(0),
        priority: 0,
        validFrom: new Date("2026-11-01T00:00:00Z"),
        validUntil: null,
        archivedAt: null,
        createdAt: new Date("2026-11-01T00:00:00Z"),
      },
    ];
    const preview = await service(rates, live).preview(
      {
        segment: "premium",
        amount: 1000,
        family: "world",
        replacesRuleId: "rule-1",
        draft: {
          segment: "premium",
          minCount: 6,
          maxCount: 6,
          allowed: true,
          platformSharePct: 50,
          priority: 0,
        },
      },
      NOW,
    );
    expect(
      preview.rows.map((r) => [
        r.count,
        r.totalAmount,
        r.platformCostAmount,
        r.ruleId,
      ]),
    ).toEqual([
      [3, 1066.38, 0, null],
      [6, 1071.12, 49.98, DRAFT_RULE_ID],
    ]);
  });

  it("shows disallowed counts as not offered", async () => {
    const preview = await service(rates).preview(
      {
        segment: "guest",
        amount: 1000,
        family: "world",
        draft: {
          segment: "guest",
          minCount: 2,
          maxCount: 12,
          allowed: false,
          platformSharePct: 0,
          priority: 0,
        },
      },
      NOW,
    );
    expect(
      preview.rows.every((r) => !r.offered && r.totalAmount === null),
    ).toBe(true);
  });

  it("validates the draft like a saved rule", async () => {
    await expect(
      service(rates).preview(
        {
          segment: "premium",
          amount: 1000,
          family: "world",
          draft: {
            segment: "premium",
            minCount: 2,
            maxCount: 3,
            allowed: true,
            platformSharePct: 101,
            priority: 0,
          },
        },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an unknown family and reports missing rates or rows", async () => {
    await expect(
      service(rates).preview(
        { segment: "free", amount: 1000, family: "visa" },
        NOW,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.admin.installments.preview.familyInvalid" },
    });
    expect(
      await service(rates).preview(
        { segment: "free", amount: 1000, family: "axess" },
        NOW,
      ),
    ).toMatchObject({ reason: "card_not_eligible", rows: [] });
    expect(
      await service({ latest: jest.fn(async () => null) }).preview(
        { segment: "free", amount: 1000, family: "world" },
        NOW,
      ),
    ).toMatchObject({ reason: "unavailable", rows: [], rateSnapshotId: null });
  });
});
