import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  pickSellerTrustFormulaParams,
  SELLER_TRUST_COMPONENTS_V1,
  SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
  SELLER_TRUST_PARAM_LIMITS,
  SELLER_TRUST_WEIGHT_SUM_TOLERANCE,
  sellerTrustLevel,
  type SellerTrustComponentsV1,
  type SellerTrustFormulaParams,
  type SellerTrustInputs,
  type SellerTrustLabAsOf,
  type SellerTrustLabNotScoredReason,
  type SellerTrustLabParamsResponse,
  type SellerTrustLabPopulation,
  type SellerTrustLabPopulationFilters,
  type SellerTrustLabScenarioPreset,
  type SellerTrustLabScenarioResult,
  type SellerTrustLabSeller,
  type SellerTrustLabStoredRow,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { deploymentEnvironment } from "../../../config/environment";
import {
  inReadOnlySnapshot,
  type ReadSnapshotLimits,
} from "../../../common/helpers/bounded-transaction";
import { i18nMessage } from "../../i18n";
import {
  UserSellerTrustStatsService,
  type TrustLabSubject,
} from "../../user/stats/user-seller-trust-stats.service";
import {
  SellerTrustService,
  type StoredSellerTrustRow,
} from "../seller-trust.service";
import { computeSellerTrust } from "../helpers/trust-formula";
import { TRUST_FORMULA_V1 as F } from "../helpers/trust-formula.constants";
import { explainSellerTrust } from "../helpers/trust-explain";
import { SELLER_TRUST_GOLDEN_V1 } from "../helpers/trust-golden-v1";
import { hasTrustActivity } from "../helpers/trust-inputs";
import { SellerTrustInputsReader } from "../inputs/seller-trust-inputs.reader";
import { changedTrustInputs, storedTrustInputs } from "./stored-inputs.helper";
import {
  buildProposal,
  summarisePopulation,
  type PopulationRow,
} from "./population-summary.helper";

/** One seller: about 7 indexed statements for one id. */
const SELLER_LIMITS: ReadSnapshotLimits = {
  statementTimeoutMs: 5_000,
  transactionTimeoutMs: 10_000,
};
/** The population: `seller_trust_scores` only, plus at most 40 usernames. */
const POPULATION_LIMITS: ReadSnapshotLimits = {
  statementTimeoutMs: 5_000,
  transactionTimeoutMs: 20_000,
};
const PAGE_SIZE = 2_000;

function notScoredReason(
  subject: TrustLabSubject,
): SellerTrustLabNotScoredReason | null {
  if (subject.deleted) return "deleted";
  if (subject.banned) return "banned";
  if (subject.testLane) return "testLane";
  return null;
}

function toStoredRow(row: StoredSellerTrustRow): SellerTrustLabStoredRow {
  return {
    scoreX100: row.scoreX100,
    level: sellerTrustLevel(row.scoreX100),
    formulaVersion: row.formulaVersion,
    computedAt: row.computedAt.toISOString(),
    components: row.components as unknown as SellerTrustComponentsV1,
  };
}

/**
 * The admin seller trust lab (tarodan-ops plan
 * 2026-11-03-seller-trust-score-lab): explain, recompute and simulate the
 * score with the same formula code as the nightly batch.
 *
 * Read-only by construction. Every database read runs in one
 * `inReadOnlySnapshot` (READ ONLY, REPEATABLE READ, statement timeout), so
 * Postgres itself refuses a write. Nothing is stored, cached, queued or
 * emitted; a candidate result only lives in the response. Responses carry
 * no counterparty key, order or trade id, buyer name or e-mail (hash). The
 * caller validates the request (`lab-request.helper.ts`) and writes the
 * audit row.
 */
@Injectable()
export class SellerTrustLabService {
  private readonly logger = new Logger(SellerTrustLabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerTrust: SellerTrustService,
    private readonly inputs: SellerTrustInputsReader,
    private readonly users: UserSellerTrustStatsService,
  ) {}

  /** The v1 parameter set, its limits and the environment. No database. */
  params(): SellerTrustLabParamsResponse {
    return {
      formulaVersion: F.version,
      v1: pickSellerTrustFormulaParams(F),
      limits: SELLER_TRUST_PARAM_LIMITS,
      weightSumTolerance: SELLER_TRUST_WEIGHT_SUM_TOLERANCE,
      components: SELLER_TRUST_COMPONENTS_V1,
      populationMaxRows: SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
      environment: deploymentEnvironment(),
    };
  }

  /** The approved golden scenarios with their v1 result. No database. */
  scenarios(): SellerTrustLabScenarioPreset[] {
    return SELLER_TRUST_GOLDEN_V1.map((g) => ({
      id: g.id,
      key: g.key,
      inputs: { ...g.inputs },
      approved: { scoreX100: g.scoreX100, level: g.level },
      v1: explainSellerTrust(g.inputs),
    }));
  }

  /** Hypothetical inputs through the pure formula. No database (D4). */
  scenario(
    inputs: SellerTrustInputs,
    candidate: SellerTrustFormulaParams | null,
  ): SellerTrustLabScenarioResult {
    return {
      v1: explainSellerTrust(inputs),
      candidate: candidate ? explainSellerTrust(inputs, candidate) : null,
    };
  }

  /**
   * One seller, read live and exactly as the batch reads it (the same
   * reader, the guest buyer resolved in the same snapshot), next to the
   * stored row. `stored` as-of reproduces the last nightly run; without a
   * stored row it falls back to now and says so.
   */
  async seller(
    userId: string,
    requested: SellerTrustLabAsOf,
    candidate: SellerTrustFormulaParams | null,
  ): Promise<SellerTrustLabSeller> {
    const now = new Date();
    const read = await inReadOnlySnapshot(
      this.prisma,
      SELLER_LIMITS,
      async (tx) => {
        const subject = await this.users.trustLabSubject(tx, userId);
        if (!subject) return null;
        const stored = await this.sellerTrust.readStoredRow(tx, userId);
        const used: SellerTrustLabAsOf =
          requested === "stored" && stored ? "stored" : "now";
        const at = used === "stored" && stored ? stored.computedAt : now;
        const reason = notScoredReason(subject);
        if (reason) return { subject, stored, used, at, reason, inputs: null };
        const guestBuyer = await this.inputs.guestBuyerId(tx);
        const [assembled] = await this.inputs.readInputs(
          tx,
          [userId],
          at,
          guestBuyer,
        );
        if (!assembled) {
          // The subject read and the eligibility read share the snapshot,
          // so an eligible subject always comes back.
          throw new Error("seller trust lab: eligible seller was not read");
        }
        return {
          subject,
          stored,
          used,
          at,
          reason: null,
          inputs: assembled.inputs,
        };
      },
    );
    if (!read) {
      throw new NotFoundException(i18nMessage("server.user.notFound"));
    }

    const windows = this.inputs.windowsAt(read.at);
    const window = (w: { since: Date; until: Date }) => ({
      since: w.since.toISOString(),
      until: w.until.toISOString(),
    });
    const stored = read.stored ? toStoredRow(read.stored) : null;

    let live: SellerTrustLabSeller["live"] = null;
    if (read.inputs) {
      const v1 = computeSellerTrust(read.inputs);
      live = {
        inputs: read.inputs,
        hasActivity: hasTrustActivity(read.inputs),
        v1: explainSellerTrust(read.inputs),
        candidate: candidate
          ? explainSellerTrust(read.inputs, candidate)
          : null,
        comparison:
          read.stored && read.stored.formulaVersion === F.version
            ? {
                sameScore: read.stored.scoreX100 === v1.scoreX100,
                changedInputs: changedTrustInputs(
                  read.stored.components,
                  v1.components,
                ),
              }
            : null,
      };
    }

    return {
      userId: read.subject.id,
      username: read.subject.username,
      asOf: { requested, used: read.used, at: read.at.toISOString() },
      windows: {
        rating: window(windows.rating),
        operations: window(windows.operations),
        volume: window(windows.volume),
      },
      stored,
      notScored: read.reason,
      live,
    };
  }

  /**
   * The candidate against every stored row matching `filters` (decision D2:
   * no hot table is read). Counts first and refuses more than
   * `SELLER_TRUST_LAB_POPULATION_MAX_ROWS` before reading a row; then reads
   * primary-key pages, never past the count, in the same snapshot.
   */
  async population(
    candidate: SellerTrustFormulaParams,
    filters: SellerTrustLabPopulationFilters,
  ): Promise<SellerTrustLabPopulation> {
    const started = Date.now();
    const result = await inReadOnlySnapshot(
      this.prisma,
      POPULATION_LIMITS,
      async (tx) => {
        const total = await this.sellerTrust.countStored(tx, filters);
        if (total > SELLER_TRUST_LAB_POPULATION_MAX_ROWS) {
          throw new UnprocessableEntityException(
            i18nMessage("server.sellerTrustLab.populationTooLarge", {
              limit: SELLER_TRUST_LAB_POPULATION_MAX_ROWS,
            }),
          );
        }

        const rows: PopulationRow[] = [];
        const skips = {
          rowsRead: 0,
          skippedOtherVersion: 0,
          skippedUnreadable: 0,
        };
        let after: string | null = null;
        while (skips.rowsRead < total) {
          const page = await this.sellerTrust.readStoredPage(
            tx,
            filters,
            after,
            Math.min(PAGE_SIZE, total - skips.rowsRead),
          );
          if (page.length === 0) break;
          skips.rowsRead += page.length;
          after = page[page.length - 1].userId;
          for (const row of page) {
            if (row.formulaVersion !== F.version) {
              skips.skippedOtherVersion += 1;
              continue;
            }
            const inputs = storedTrustInputs(row.components);
            if (!inputs) {
              skips.skippedUnreadable += 1;
              continue;
            }
            rows.push({
              userId: row.userId,
              computedAt: row.computedAt,
              storedX100: row.scoreX100,
              v1X100: computeSellerTrust(inputs).scoreX100,
              candidateX100: explainSellerTrust(inputs, candidate).scoreX100,
            });
          }
        }

        const { summary, movers } = summarisePopulation(rows, skips);
        const names = await this.users.usernames(tx, [
          ...movers.up.map((m) => m.userId),
          ...movers.down.map((m) => m.userId),
        ]);
        const named = (list: typeof movers.up) =>
          list.map((m) => ({ ...m, username: names.get(m.userId) ?? "" }));
        return {
          summary,
          movers: { up: named(movers.up), down: named(movers.down) },
        };
      },
    );

    const { v1Consistency: c } = result.summary;
    this.logger.log(
      `Seller trust lab population: rows=${result.summary.rowsRead} compared=${result.summary.rowsCompared} matched=${c.matched} offByOne=${c.offByOne} mismatched=${c.mismatched} ms=${Date.now() - started}`,
    );

    return {
      params: candidate,
      filters,
      summary: result.summary,
      movers: result.movers,
      proposal: buildProposal({
        params: candidate,
        filters,
        summary: result.summary,
        environment: deploymentEnvironment(),
        generatedAt: new Date(),
      }),
    };
  }
}
