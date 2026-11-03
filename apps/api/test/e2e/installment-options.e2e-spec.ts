import { MembershipTierType, Prisma, SubscriptionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { disconnectPrisma, getPrisma } from "../test-utils/db";
import {
  createGroupOrder,
  createGroupPayment,
  createRateSnapshot,
} from "../factories/installment.factory";
import { AdminAuditService } from "../../src/modules/admin/ops/admin-audit.service";
import { AdminInstallmentsService } from "../../src/modules/admin/finance/admin-installments.service";
import { InstallmentOptionsService } from "../../src/modules/payment/installments/installment-options.service";
import { InstallmentRatesService } from "../../src/modules/payment/installments/installment-rates.service";
import { InstallmentRulesService } from "../../src/modules/payment/installments/installment-rules.service";
import { InstallmentSettingsService } from "../../src/modules/payment/installments/installment-settings.service";

/**
 * Installment options, segment rules and settings on a real database (ADR
 * 0019, plan task A3). No app boot: the real services and the real audit
 * writer run on Prisma; PayTR (BIN, rates) and Redis are in-memory fakes, so
 * no PayTR call leaves the test.
 *
 * Covers: rule versioning (archive + next version in one transaction, the
 * DB's one-live-version-per-lineage guard under a concurrent edit, 409 on a
 * stale version), the required audit row and its rollback, the settings
 * write, and the options priced from DB rows (default, a premium rule, a
 * guest rule, archive back to default, kill switch, access).
 */
describe("installment options and rules on a real database (E2E)", () => {
  const prisma = getPrisma();
  const unique = () => randomUUID().slice(0, 8);

  // Redis stand-in: get/set/del/claimKey/checkRateLimit.
  const store = new Map<string, unknown>();
  const cache = {
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    set: async (key: string, value: unknown) => void store.set(key, value),
    del: async (key: string) => void store.delete(key),
    claimKey: async (key: string) => {
      if (store.has(key)) return "held" as const;
      store.set(key, 1);
      return "claimed" as const;
    },
    checkRateLimit: async () => ({
      allowed: true,
      remaining: 1,
      resetAt: new Date(),
    }),
  };
  const paytr = {
    lookupBin: jest.fn(async () => ({
      ok: true as const,
      outcome: "success" as const,
      bank: "Test Bank",
      cardType: "credit",
      brand: "world",
      cardFamily: "world" as const,
      businessCard: false,
    })),
    getInstallmentRates: jest.fn(async (requestId: string) => ({
      ok: true as const,
      requestId,
      maxInstallmentNonBusiness: 6,
      singleRatePct: "3",
      rates: { world: { "3": "8", "6": "13" } },
      ignored: [],
      raw: { status: "success" },
    })),
  };
  const providers = { resolve: () => paytr };

  const settings = new InstallmentSettingsService(prisma as never);
  const rates = new InstallmentRatesService(
    prisma as never,
    cache as never,
    providers as never,
    settings,
  );
  const rules = new InstallmentRulesService(prisma as never, rates);
  const options = new InstallmentOptionsService(
    prisma as never,
    cache as never,
    providers as never,
    settings,
    rates,
    rules,
  );
  const audit = new AdminAuditService(prisma as never);
  const admin = new AdminInstallmentsService(
    prisma as never,
    audit,
    settings,
    rates,
    rules,
  );

  let superAdminUserId: string;
  let premiumTierId: string;

  const RULE = {
    name: "Premium 3 taksit vade farksız",
    segment: "premium" as const,
    minCount: 2,
    maxCount: 3,
    allowed: true,
    platformSharePct: 100,
    priority: 0,
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: null,
  };

  /** A cart payment of 1,000.00 with one order whose seller keeps 900.00. */
  async function cart(opts: { guest?: boolean } = {}) {
    const payment = await createGroupPayment();
    const { orderId } = await createGroupOrder(payment);
    await prisma.order.update({
      where: { id: orderId },
      data: { commissionAmount: new Prisma.Decimal("100.00") },
    });
    if (opts.guest) {
      await prisma.checkoutGroup.update({
        where: { id: payment.groupId },
        data: { isGuest: true },
      });
    }
    return payment;
  }

  async function makePremium(userId: string) {
    await prisma.userMembership.create({
      data: {
        userId,
        tierId: premiumTierId,
        status: SubscriptionStatus.active,
        currentPeriodStart: new Date(Date.now() - 86_400_000),
        currentPeriodEnd: new Date(Date.now() + 10 * 86_400_000),
      },
    });
  }

  const totals = (answer: { options: Array<{ totalAmount: number }> }) =>
    answer.options.map((o) => o.totalAmount);

  beforeAll(async () => {
    // Start from the defaults whatever earlier suites left: no live rule
    // (versions cannot be deleted, archiving is allowed) and no setting row.
    await prisma.installmentRule.updateMany({
      where: { archivedAt: null },
      data: { archivedAt: new Date(), archivedBy: "e2e-reset" },
    });
    await prisma.platformSetting.deleteMany({
      where: {
        settingKey: { in: ["installments_enabled", "installment_min_amount"] },
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `installment-admin-${unique()}@test.local`,
        passwordHash: "not-a-real-hash",
        displayName: "Installment Admin",
      },
    });
    await prisma.adminUser.create({
      data: { userId: user.id, role: "super_admin" },
    });
    superAdminUserId = user.id;
    const tier = await prisma.membershipTier.upsert({
      where: { type: MembershipTierType.premium },
      update: {},
      create: {
        type: MembershipTierType.premium,
        name: "Premium",
        monthlyPrice: new Prisma.Decimal("99.00"),
        yearlyPrice: new Prisma.Decimal("990.00"),
        maxFreeListings: 10,
        maxTotalListings: 100,
        maxImagesPerListing: 10,
      },
    });
    premiumTierId = tier.id;
    await createRateSnapshot({
      maxInstallmentNonBusiness: 6,
      rates: { world: { "3": "8", "6": "13" } },
    });
    await admin.updateSettings(superAdminUserId, {
      enabled: true,
      minAmount: 500,
    });
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  describe("settings", () => {
    it("writes the kill switch with its audit row and serves it on /payments/config", async () => {
      const row = await prisma.platformSetting.findUnique({
        where: { settingKey: "installments_enabled" },
      });
      expect(row?.settingValue).toBe("true");
      const logs = await prisma.auditLog.findMany({
        where: { entityType: "platform_setting", entityId: row?.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        action: "installment_setting_update",
        oldValue: { settingKey: "installments_enabled", value: null },
        newValue: { settingKey: "installments_enabled", value: "true" },
      });
      expect(await options.publicConfig()).toEqual({
        enabled: true,
        minAmount: 500,
      });
    });
  });

  describe("rule versioning", () => {
    it("creates version 1, then edit = archive + version 2 of the same lineage, both audited", async () => {
      const created = await admin.createRule(superAdminUserId, RULE);
      expect(created.rule).toMatchObject({ version: 1, status: "active" });
      expect(created.rule.lineageId).toBe(created.rule.id);

      const edited = await admin.createRuleVersion(
        superAdminUserId,
        created.rule.id,
        {
          ...RULE,
          platformSharePct: 50,
        },
      );
      expect(edited.rule).toMatchObject({
        lineageId: created.rule.id,
        version: 2,
        platformSharePct: 50,
      });
      const lineage = await prisma.installmentRule.findMany({
        where: { lineageId: created.rule.id },
        orderBy: { version: "asc" },
      });
      expect(lineage.map((r) => [r.version, r.archivedAt !== null])).toEqual([
        [1, true],
        [2, false],
      ]);
      const adminRow = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: superAdminUserId },
      });
      expect(lineage[0].archivedBy).toBe(adminRow.id);
      expect(lineage[1].createdBy).toBe(adminRow.id);

      const logs = await prisma.auditLog.findMany({
        where: {
          entityType: "installment_rule",
          entityId: { in: lineage.map((r) => r.id) },
        },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((l) => l.action)).toEqual([
        "installment_rule_create",
        "installment_rule_version",
      ]);

      // The old version is no longer current: 409, nothing written.
      await expect(
        admin.createRuleVersion(superAdminUserId, created.rule.id, RULE),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await prisma.installmentRule.count({
          where: { lineageId: created.rule.id },
        }),
      ).toBe(2);

      // Clean up: archive the live version so later tests start from the default.
      const archived = await admin.archiveRule(
        superAdminUserId,
        edited.rule.id,
      );
      expect(archived.rule.status).toBe("archived");
      await expect(
        admin.archiveRule(superAdminUserId, edited.rule.id),
      ).rejects.toMatchObject({
        status: 409,
      });
    });

    it("lets exactly one of two concurrent edits of the same version through", async () => {
      const created = await admin.createRule(superAdminUserId, {
        ...RULE,
        name: "Concurrent",
      });
      const results = await Promise.allSettled([
        admin.createRuleVersion(superAdminUserId, created.rule.id, {
          ...RULE,
          name: "A",
        }),
        admin.createRuleVersion(superAdminUserId, created.rule.id, {
          ...RULE,
          name: "B",
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const live = await prisma.installmentRule.findMany({
        where: { lineageId: created.rule.id, archivedAt: null },
      });
      expect(live).toHaveLength(1);
      expect(live[0].version).toBe(2);
      await admin.archiveRule(superAdminUserId, live[0].id);
    });

    it("rolls the rule back when the audit row cannot be written", async () => {
      const before = await prisma.installmentRule.count();
      await expect(
        admin.createRule(randomUUID(), { ...RULE, name: "No admin" }),
      ).rejects.toThrow(/Active admin user not found/);
      expect(await prisma.installmentRule.count()).toBe(before);
    });

    it("warns about an overlapping current rule with the same priority", async () => {
      const a = await admin.createRule(superAdminUserId, {
        ...RULE,
        name: "Overlap A",
      });
      const b = await admin.createRule(superAdminUserId, {
        ...RULE,
        name: "Overlap B",
        segment: "all",
        minCount: 3,
        maxCount: 6,
      });
      expect(b.overlaps.map((o) => o.id)).toEqual([a.rule.id]);
      await admin.archiveRule(superAdminUserId, a.rule.id);
      await admin.archiveRule(superAdminUserId, b.rule.id);
    });
  });

  describe("options priced from DB rows", () => {
    const BIN = { bin: "45467112" };

    it("prices the default for a free-tier buyer (plan 4.4)", async () => {
      const payment = await cart();
      const answer = await options.getOptions(
        { ...BIN, paymentId: payment.paymentId },
        { userId: payment.buyerId, capabilityAuthorized: false },
      );
      expect(answer.enabled).toBe(true);
      expect(totals(answer)).toEqual([1000, 1066.38, 1142.22]);
    });

    it("gives a premium buyer 'vade farksız' at 3 under a premium rule, and the default after the archive", async () => {
      const payment = await cart();
      await makePremium(payment.buyerId);
      const caller = { userId: payment.buyerId, capabilityAuthorized: false };
      const { rule } = await admin.createRule(superAdminUserId, RULE);

      const withRule = await options.getOptions(
        { ...BIN, paymentId: payment.paymentId },
        caller,
      );
      expect(withRule.options[1]).toEqual({
        count: 3,
        totalAmount: 1000,
        feeAmount: 0,
        monthlyAmount: 333.33,
      });
      expect(withRule.options[2].totalAmount).toBe(1142.22);

      const freeBuyer = await cart();
      const free = await options.getOptions(
        { ...BIN, paymentId: freeBuyer.paymentId },
        { userId: freeBuyer.buyerId, capabilityAuthorized: false },
      );
      expect(totals(free)).toEqual([1000, 1066.38, 1142.22]);

      await admin.archiveRule(superAdminUserId, rule.id);
      const afterArchive = await options.getOptions(
        { ...BIN, paymentId: payment.paymentId },
        caller,
      );
      expect(totals(afterArchive)).toEqual([1000, 1066.38, 1142.22]);
    });

    it("does not apply a scheduled rule before it starts", async () => {
      const payment = await cart();
      await makePremium(payment.buyerId);
      const { rule } = await admin.createRule(superAdminUserId, {
        ...RULE,
        validFrom: new Date(Date.now() + 3_600_000).toISOString(),
      });
      const answer = await options.getOptions(
        { ...BIN, paymentId: payment.paymentId },
        { userId: payment.buyerId, capabilityAuthorized: false },
      );
      expect(totals(answer)).toEqual([1000, 1066.38, 1142.22]);
      await admin.archiveRule(superAdminUserId, rule.id);
    });

    it("lets a guest rule turn installments off for guest carts only", async () => {
      const { rule } = await admin.createRule(superAdminUserId, {
        ...RULE,
        name: "No installments for guests",
        segment: "guest",
        minCount: 2,
        maxCount: 12,
        allowed: false,
        platformSharePct: 0,
      });
      const guestCart = await cart({ guest: true });
      expect(
        await options.getOptions(
          { ...BIN, paymentId: guestCart.paymentId },
          { userId: null, capabilityAuthorized: true },
        ),
      ).toMatchObject({ enabled: false, reason: "not_offered_for_payment" });

      const memberCart = await cart();
      expect(
        await options.getOptions(
          { ...BIN, paymentId: memberCart.paymentId },
          { userId: memberCart.buyerId, capabilityAuthorized: false },
        ),
      ).toMatchObject({ enabled: true });
      await admin.archiveRule(superAdminUserId, rule.id);
    });

    it("refuses another user's payment", async () => {
      const payment = await cart();
      await expect(
        options.getOptions(
          { ...BIN, paymentId: payment.paymentId },
          { userId: randomUUID(), capabilityAuthorized: false },
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("answers below_minimum after the minimum is raised, and disabled after the kill switch", async () => {
      const payment = await cart();
      const caller = { userId: payment.buyerId, capabilityAuthorized: false };
      await admin.updateSettings(superAdminUserId, { minAmount: 1500 });
      expect(
        await options.getOptions(
          { ...BIN, paymentId: payment.paymentId },
          caller,
        ),
      ).toMatchObject({ reason: "below_minimum", minAmount: 1500 });
      await admin.updateSettings(superAdminUserId, {
        enabled: false,
        minAmount: 500,
      });
      expect(
        await options.getOptions(
          { ...BIN, paymentId: payment.paymentId },
          caller,
        ),
      ).toMatchObject({ enabled: false, reason: "disabled" });
      await admin.updateSettings(superAdminUserId, { enabled: true });
    });
  });

  describe("rate snapshots", () => {
    it("stores a refreshed snapshot whose id is the PayTR request_id with hyphens", async () => {
      expect(await rates.refresh()).toBe("stored");
      const requestId = paytr.getInstallmentRates.mock.calls.at(
        -1,
      )?.[0] as string;
      const stored = await prisma.installmentRateSnapshot.findMany({
        where: { paytrMerchant: "marketplace" },
        orderBy: { fetchedAt: "desc" },
        take: 1,
      });
      expect(stored[0].id.replace(/-/g, "")).toBe(requestId);
      expect(stored[0].singleRatePct.toString()).toBe("3");
      // Append-only: the DB refuses to change a snapshot.
      await expect(
        prisma.installmentRateSnapshot.update({
          where: { id: stored[0].id },
          data: { maxInstallmentNonBusiness: 12 },
        }),
      ).rejects.toThrow();
    });
  });
});
