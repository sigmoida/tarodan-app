import * as request from "supertest";
import { getQueueToken } from "@nestjs/bull";
import { AdminRole } from "@prisma/client";
import {
  pickSellerTrustFormulaParams,
  SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
  type SellerTrustComponentsV1,
  type SellerTrustFormulaParams,
} from "@tarodan/types";
import type { Queue } from "bull";
import { createE2ETestApp, type E2ETestApp } from "../test-utils/create-app";
import {
  disconnectPrisma,
  getPrisma,
  seedBaseline,
  truncateAll,
} from "../test-utils/db";
import {
  authHeader,
  createAdminUser,
  createUser,
  type CreatedTestAdmin,
} from "../factories/user.factory";
import { sellerTrustFixtures } from "../factories/seller-trust.factory";
import { SellerTrustSchedulerService } from "../../src/modules/seller-trust/jobs/seller-trust-scheduler.service";
import { TRUST_FORMULA_V1 } from "../../src/modules/seller-trust/helpers/trust-formula.constants";
import { SELLER_TRUST_GOLDEN_V1 } from "../../src/modules/seller-trust/helpers/trust-golden-v1";
import { RolesGuard } from "../../src/modules/auth/guards/roles.guard";
import { SYSTEM_GUEST_EMAIL } from "../../src/modules/invoicing/invoice/guest-recipient";
import { QUEUE_NAMES } from "../../src/workers/constants";

/**
 * The admin seller trust lab against a real app and Postgres (tarodan-ops
 * plan 2026-11-03-seller-trust-score-lab, 4.3 proof 4; AC-A1 to AC-A15).
 *
 * The nightly batch scores seeded sellers first. Then every lab endpoint is
 * called as a super admin and as an admin, and the spec proves the lab
 * wrote nothing: `seller_trust_scores` and the product ranking columns
 * have the same checksum, the scheduled queue got no job, and the only new
 * rows are one audit row per audited call, naming its actor.
 */
const DAY = 86_400_000;
const asOf = new Date("2026-10-21T23:30:00.000Z");
const BASE = "/api/admin/seller-trust-lab";

const v1 = (): SellerTrustFormulaParams =>
  pickSellerTrustFormulaParams(TRUST_FORMULA_V1);
/** Extreme but valid: everything on reliability, minimal priors and minimums. */
const extreme = (): SellerTrustFormulaParams => ({
  weights: { rating: 0, reliability: 1, onTime: 0, volume: 0, tenure: 0 },
  rating: { priorMean: 1, priorWeight: 1 },
  reliability: { priorRate: 1, priorWeight: 1, zeroAt: 0.01 },
  onTime: { priorRate: 0, priorWeight: 100, zeroAt: 1 },
  volume: { saturation: 1 },
  tenure: { fullAtDays: 1 },
  minimum: { transactions: 1, counterparties: 1 },
});

let categoryId: string;
const fx = sellerTrustFixtures({ asOf, categoryId: () => categoryId });

/** md5 of every stored score row, in primary-key order. */
async function scoresChecksum(): Promise<string> {
  const [row] = await getPrisma().$queryRaw<Array<{ sum: string }>>`
    SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t."user_id"), '')) AS "sum"
    FROM "seller_trust_scores" t`;
  return row.sum;
}

/** md5 of the ranking columns of every product (`ProductRankingService`). */
async function rankingChecksum(): Promise<string> {
  const [row] = await getPrisma().$queryRaw<Array<{ sum: string }>>`
    SELECT md5(coalesce(string_agg(concat_ws(',', p."id", p."quality_score",
      p."rank_tier", p."relevance_score", p."popularity_score",
      p."popularity_updated_at"), '|' ORDER BY p."id"), '')) AS "sum"
    FROM "products" p`;
  return row.sum;
}

async function grantMatrix(
  ctx: E2ETestApp,
  permissions: Record<string, string[]>,
): Promise<void> {
  const value = JSON.stringify(permissions);
  await getPrisma().platformSetting.upsert({
    where: { settingKey: "admin_role_permissions" },
    update: { settingValue: value, settingType: "json" },
    create: {
      settingKey: "admin_role_permissions",
      settingValue: value,
      settingType: "json",
    },
  });
  ctx.module.get(RolesGuard).invalidateCache();
}

describe("seller trust lab (E2E)", () => {
  let ctx: E2ETestApp;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    fx.reset();
    ({ categoryId } = await seedBaseline());
  });

  /**
   * A scored seller with five buyers and guests with several e-mails (two
   * of them the same person in another case), a seller below the minimum,
   * a seller banned after the run, and a test-lane account. Then the batch.
   */
  async function seedAndRun() {
    const scored = await fx.user();
    await fx.caseD(scored);
    const guest = await fx.user({ email: SYSTEM_GUEST_EMAIL });
    for (const guestEmail of [
      "a@guest.test",
      "b@guest.test",
      " B@Guest.test ",
      undefined,
    ]) {
      await fx.order({
        sellerId: scored,
        buyerId: guest,
        shippingAddress: {
          isGuestOrder: true,
          ...(guestEmail ? { guestEmail } : {}),
        },
      });
    }

    const small = await fx.user();
    for (let i = 0; i < 2; i++) {
      await fx.order({ sellerId: small, buyerId: await fx.user() });
    }

    const banned = await fx.user();
    await fx.caseD(banned);

    const testLane = await fx.user({ isTestAccount: true });

    // A product with ranking columns, so the ranking checksum has content.
    await fx.productOf(scored);

    await ctx.module
      .get(SellerTrustSchedulerService)
      .runRefresh(undefined, asOf);
    await getPrisma().user.update({
      where: { id: banned },
      data: { isBanned: true },
    });
    return { scored, small, banned, testLane };
  }

  it("answers every lab call for super admin and admin, and writes nothing but the audit rows", async () => {
    const s = await seedAndRun();
    const prisma = getPrisma();
    const storedScored = await prisma.sellerTrustScore.findUniqueOrThrow({
      where: { userId: s.scored },
    });
    const storedComponents =
      storedScored.components as unknown as SellerTrustComponentsV1;
    // The guests: a, b (twice, one person) and one without an e-mail.
    expect(storedComponents.volume.counterparties).toBe(5 + 2 + 1);
    expect(storedScored.scoreX100).not.toBeNull();

    const superAdmin = await createAdminUser(ctx.module, {
      role: AdminRole.super_admin,
    });
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const adminIds = new Map(
      (
        await prisma.adminUser.findMany({
          where: { userId: { in: [superAdmin.id, admin.id] } },
          select: { id: true, userId: true },
        })
      ).map((a) => [a.userId, a.id]),
    );

    const queue = ctx.module.get<Queue>(getQueueToken(QUEUE_NAMES.SCHEDULED));
    const scoresBefore = await scoresChecksum();
    const rankingBefore = await rankingChecksum();
    const auditBefore = await prisma.auditLog.count();
    const windowStart = Date.now();

    const audited: Array<{
      actor: CreatedTestAdmin;
      action: string;
      entityId: string;
    }> = [];

    for (const actor of [superAdmin, admin]) {
      const as = authHeader(actor);

      // AC-A13: params with the environment, no-store (AC-A11).
      const params = await request(server()).get(`${BASE}/params`).set(as);
      expect(params.status).toBe(200);
      expect(params.headers["cache-control"]).toBe("no-store");
      expect(params.body).toMatchObject({
        formulaVersion: 1,
        v1: v1(),
        populationMaxRows: SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
        environment: { env: "test", isProd: false },
      });

      const scenarios = await request(server())
        .get(`${BASE}/scenarios`)
        .set(as);
      expect(scenarios.status).toBe(200);
      expect(scenarios.headers["cache-control"]).toBe("no-store");
      expect(scenarios.body).toHaveLength(10);

      // AC-U9 backing: a golden scenario gives the approved score.
      const golden = SELLER_TRUST_GOLDEN_V1[4];
      const scenario = await request(server())
        .post(`${BASE}/scenario`)
        .set(as)
        .send({ inputs: golden.inputs, params: extreme() });
      expect(scenario.status).toBe(200);
      expect(scenario.headers["cache-control"]).toBe("no-store");
      expect(scenario.body.v1.scoreX100).toBe(golden.scoreX100);
      expect(scenario.body.candidate).not.toBeNull();

      // AC-A6: as of the stored run, the live recompute equals the stored
      // row, counterparties (several guest e-mails) included.
      const stored = await request(server())
        .post(`${BASE}/sellers/${s.scored}`)
        .set(as)
        .send({ asOf: "stored" });
      expect(stored.status).toBe(200);
      expect(stored.headers["cache-control"]).toBe("no-store");
      expect(stored.body.asOf).toEqual({
        requested: "stored",
        used: "stored",
        at: asOf.toISOString(),
      });
      expect(stored.body.live.v1.scoreX100).toBe(storedScored.scoreX100);
      expect(stored.body.live.inputs.counterparties).toBe(
        storedComponents.volume.counterparties,
      );
      expect(stored.body.live.inputs.transactions).toBe(
        storedComponents.volume.transactions,
      );
      expect(stored.body.live.comparison).toEqual({
        sameScore: true,
        changedInputs: [],
      });
      expect(JSON.stringify(stored.body)).not.toMatch(
        /guest:|counterpartyKey|guest\.test|orderId/,
      );
      audited.push({
        actor,
        action: "seller_trust_lab_seller",
        entityId: s.scored,
      });

      const now = await request(server())
        .post(`${BASE}/sellers/${s.scored}`)
        .set(as)
        .send({ asOf: "now", params: extreme() });
      expect(now.status).toBe(200);
      expect(now.body.live.candidate.scoreX100).not.toBeNull();
      audited.push({
        actor,
        action: "seller_trust_lab_seller",
        entityId: s.scored,
      });

      // AC-A7: below the minimum, banned, test lane, unknown.
      const small = await request(server())
        .post(`${BASE}/sellers/${s.small}`)
        .set(as)
        .send({});
      expect(small.status).toBe(200);
      expect(small.body.live.v1).toMatchObject({
        scoreX100: null,
        level: "new",
        minimum: { transactions: 5, counterparties: 3, met: false },
      });
      audited.push({
        actor,
        action: "seller_trust_lab_seller",
        entityId: s.small,
      });

      for (const [id, reason] of [
        [s.banned, "banned"],
        [s.testLane, "testLane"],
      ] as const) {
        const res = await request(server())
          .post(`${BASE}/sellers/${id}`)
          .set(as)
          .send({});
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ notScored: reason, live: null });
        audited.push({
          actor,
          action: "seller_trust_lab_seller",
          entityId: id,
        });
      }

      const unknown = await request(server())
        .post(`${BASE}/sellers/00000000-0000-4000-8000-000000000000`)
        .set(as)
        .send({});
      expect(unknown.status).toBe(404);

      // AC-A8: a population run with extreme valid weights.
      const population = await request(server())
        .post(`${BASE}/population`)
        .set(as)
        .send({ params: extreme() });
      expect(population.status).toBe(200);
      expect(population.headers["cache-control"]).toBe("no-store");
      const rows = await prisma.sellerTrustScore.count();
      expect(population.body.summary).toMatchObject({
        rowsRead: rows,
        rowsCompared: rows,
        v1Consistency: { matched: rows, offByOne: 0, mismatched: 0 },
      });
      expect(population.body.proposal.summary).toEqual(population.body.summary);
      expect(JSON.stringify(population.body.proposal)).not.toMatch(
        /userId|username/,
      );
      audited.push({
        actor,
        action: "seller_trust_lab_population",
        entityId: "population",
      });

      const filtered = await request(server())
        .post(`${BASE}/population`)
        .set(as)
        .send({ params: v1(), filters: { levels: ["new"] } });
      expect(filtered.status).toBe(200);
      expect(filtered.body.summary.levels.stored.new).toBe(
        filtered.body.summary.rowsRead,
      );
      audited.push({
        actor,
        action: "seller_trust_lab_population",
        entityId: "population",
      });
    }

    // AC-A9: nothing changed but the audit log.
    expect(await scoresChecksum()).toBe(scoresBefore);
    expect(await rankingChecksum()).toBe(rankingBefore);

    const jobs = await queue.getJobs([
      "waiting",
      "delayed",
      "active",
      "completed",
      "failed",
    ]);
    expect(
      jobs.filter((j) => j && j.timestamp >= windowStart && !j.opts.repeat),
    ).toEqual([]);

    // AC-A12: one audit row per audited call, naming its actor.
    expect((await prisma.auditLog.count()) - auditBefore).toBe(audited.length);
    const rows = await prisma.auditLog.findMany({
      where: { action: { startsWith: "seller_trust_lab_" } },
      orderBy: { createdAt: "asc" },
    });
    expect(
      rows.map((r) => ({
        adminUserId: r.adminUserId,
        action: r.action,
        entityId: r.entityId,
      })),
    ).toEqual(
      audited.map((a) => ({
        adminUserId: adminIds.get(a.actor.id),
        action: a.action,
        entityId: a.entityId,
      })),
    );
    const populationRow = rows.find(
      (r) => r.action === "seller_trust_lab_population",
    )!;
    expect(populationRow.newValue).toEqual({
      params: extreme(),
      filters: {},
      rowsRead: await prisma.sellerTrustScore.count(),
    });
  });

  it("refuses an admin without the key, a moderator with it, a user token and no token", async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const moderator = await createAdminUser(ctx.module, {
      role: AdminRole.moderator,
    });
    const user = await createUser(ctx.module);
    // A stored matrix older than the key: admin lacks it; moderator holds it.
    await grantMatrix(ctx, {
      admin: ["users", "orders"],
      moderator: ["seller_trust_lab"],
    });

    const calls = [
      () => request(server()).get(`${BASE}/params`),
      () => request(server()).get(`${BASE}/scenarios`),
      () =>
        request(server())
          .post(`${BASE}/scenario`)
          .send({ inputs: SELLER_TRUST_GOLDEN_V1[1].inputs }),
      () => request(server()).post(`${BASE}/sellers/${admin.id}`).send({}),
      () => request(server()).post(`${BASE}/population`).send({ params: v1() }),
    ];
    const auditBefore = await getPrisma().auditLog.count();

    for (const call of calls) {
      const noKey = await call().set(authHeader(admin));
      expect(noKey.status).toBe(403);
      expect(noKey.body.i18nKey).toBe("server.auth.permissionRequired");

      const mod = await call().set(authHeader(moderator));
      expect(mod.status).toBe(403);
      expect(mod.body.i18nKey).toBe("server.auth.roleRequired");

      expect((await call().set(authHeader(user))).status).toBe(401);
      expect((await call()).status).toBe(401);
    }
    expect(await getPrisma().auditLog.count()).toBe(auditBefore);
  });

  it("answers 400 naming the field for invalid params or inputs, before any read", async () => {
    const superAdmin = await createAdminUser(ctx.module);
    const as = authHeader(superAdmin);
    const seller = await fx.user();
    const auditBefore = await getPrisma().auditLog.count();

    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      [
        "population",
        { params: { ...v1(), onTime: { ...v1().onTime, graceMinutes: 0 } } },
        "server.sellerTrustLab.invalidParams",
        "onTime.graceMinutes",
      ],
      [
        "population",
        { params: { ...v1(), windows: { volumeDays: 30 } } },
        "server.sellerTrustLab.invalidParams",
        "windows",
      ],
      [
        `sellers/${seller}`,
        { params: { ...v1(), weights: { ...v1().weights, tenure: 0.5 } } },
        "server.sellerTrustLab.invalidParams",
        "weights",
      ],
      [
        "scenario",
        { inputs: { ...SELLER_TRUST_GOLDEN_V1[1].inputs, late: 99 } },
        "server.sellerTrustLab.invalidInputs",
        "late",
      ],
    ];
    for (const [path, body, key, field] of cases) {
      const res = await request(server())
        .post(`${BASE}/${path}`)
        .set(as)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.i18nKey).toBe(key);
      expect(res.body.message).toContain(field);
    }
    expect(await getPrisma().auditLog.count()).toBe(auditBefore);
  });

  it("refuses a population above the cap with 422 and no audit row", async () => {
    const superAdmin = await createAdminUser(ctx.module);
    const prisma = getPrisma();
    const n = SELLER_TRUST_LAB_POPULATION_MAX_ROWS + 1;
    const stamp = Date.now();
    await prisma.user.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        email: `cap-${stamp}-${i}@test.local`,
        passwordHash: "x",
        displayName: "Cap Fixture",
      })),
    });
    const ids = await prisma.user.findMany({
      where: { email: { startsWith: `cap-${stamp}-` } },
      select: { id: true },
    });
    await prisma.sellerTrustScore.createMany({
      data: ids.map(({ id }) => ({
        userId: id,
        scoreX100: null,
        formulaVersion: 1,
        components: { version: 1 },
        computedAt: new Date(asOf.getTime() - DAY),
      })),
    });
    const auditBefore = await prisma.auditLog.count();

    const res = await request(server())
      .post(`${BASE}/population`)
      .set(authHeader(superAdmin))
      .send({ params: v1() });
    expect(res.status).toBe(422);
    expect(res.body.i18nKey).toBe("server.sellerTrustLab.populationTooLarge");

    // Narrowed below the cap it runs (no row matches `excellent`).
    const narrowed = await request(server())
      .post(`${BASE}/population`)
      .set(authHeader(superAdmin))
      .send({ params: v1(), filters: { levels: ["excellent"] } });
    expect(narrowed.status).toBe(200);
    expect(narrowed.body.summary.rowsRead).toBe(0);
    expect((await prisma.auditLog.count()) - auditBefore).toBe(1);
  });
});
