import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type InstallmentRule } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  installmentRuleStatusOf,
  installmentRulesOverlap,
  installmentRuleViolationKey,
  validateInstallmentRule,
  type AdminInstallmentPreviewResponse,
  type AdminInstallmentPreviewRow,
  type AdminInstallmentRule,
  type AdminInstallmentRuleRef,
  type InstallmentBuyerSegment,
  type InstallmentRuleInput,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { isPaytrCardFamily } from "../../payment-providers/paytr/paytr-installments";
import { INSTALLMENT_FEE_VAT_RATE_PCT } from "./installment-config";
import { offeredInstallmentCounts } from "./installment-eligibility";
import { priceInstallment } from "./installment-pricing";
import { InstallmentRatesService } from "./installment-rates.service";
import {
  liveInstallmentRulesWhere,
  resolveInstallmentRule,
  type InstallmentRuleCandidate,
} from "./installment-rules";

const CANDIDATE_SELECT = {
  id: true,
  segment: true,
  minCount: true,
  maxCount: true,
  allowed: true,
  platformSharePct: true,
  priority: true,
  validFrom: true,
  validUntil: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.InstallmentRuleSelect;

/** A rule version write: the row before (if any) and after, for the audit. */
export interface InstallmentRuleWrite {
  before: InstallmentRule | null;
  rule: InstallmentRule;
  overlaps: AdminInstallmentRuleRef[];
}

/** The draft rule an admin previews before saving it. */
export interface InstallmentPreviewDraft {
  segment: InstallmentRuleInput["segment"];
  minCount: number;
  maxCount: number;
  allowed: boolean;
  platformSharePct: number;
  priority: number;
}

export interface InstallmentPreviewQuery {
  segment: InstallmentBuyerSegment;
  /** T, TL. */
  amount: number;
  family: string;
  /** Previewed as live now and newest; validated like a saved rule. */
  draft?: InstallmentPreviewDraft;
  /** The version the draft replaces (editing): left out of the candidates. */
  replacesRuleId?: string;
}

/**
 * Installment segment rules (ADR 0019, plan 4.6.2): append-only versions in
 * `installment_rules`. "Edit" archives the current version and inserts
 * `version + 1` of the same lineage; "remove" archives. Writes run in the
 * caller's transaction so the admin service writes the audit row in the
 * same transaction (no change without its audit). Reads are never cached:
 * the options and the signing call read the live rules each time.
 */
@Injectable()
export class InstallmentRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: InstallmentRatesService,
  ) {}

  /** The versions that can apply to a buyer of `segment` at `at`. */
  async liveRules(
    segment: InstallmentBuyerSegment,
    at: Date,
    db: Pick<PrismaService, "installmentRule"> = this.prisma,
  ): Promise<InstallmentRuleCandidate[]> {
    return db.installmentRule.findMany({
      where: liveInstallmentRulesWhere(segment, at),
      select: CANDIDATE_SELECT,
    });
  }

  /** Every version, current ones first, newest first (tens of rows). */
  async list(now: Date = new Date()): Promise<AdminInstallmentRule[]> {
    const rows = await this.prisma.installmentRule.findMany({
      orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    });
    return rows
      .map((row) => toAdminInstallmentRule(row, now))
      .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
  }

  async create(
    tx: Prisma.TransactionClient,
    input: InstallmentRuleInput,
    adminId: string,
  ): Promise<InstallmentRuleWrite> {
    assertValidRule(input);
    const id = randomUUID();
    const rule = await tx.installmentRule.create({
      data: {
        id,
        lineageId: id,
        version: 1,
        createdBy: adminId,
        ...valuesOf(input),
      },
    });
    return { before: null, rule, overlaps: await this.overlapsOf(tx, rule) };
  }

  /**
   * Edit = archive the current version and insert the next one, in `tx`.
   * The current row is locked first; a version that is no longer current
   * (archived or replaced, also by a concurrent edit) is a 409.
   */
  async createVersion(
    tx: Prisma.TransactionClient,
    ruleId: string,
    input: InstallmentRuleInput,
    adminId: string,
  ): Promise<InstallmentRuleWrite> {
    assertValidRule(input);
    const before = await this.lockCurrent(tx, ruleId);
    const now = new Date();
    await this.archiveRow(tx, before.id, adminId, now);
    const latest = await tx.installmentRule.aggregate({
      where: { lineageId: before.lineageId },
      _max: { version: true },
    });
    const rule = await tx.installmentRule.create({
      data: {
        lineageId: before.lineageId,
        version: (latest._max.version ?? before.version) + 1,
        createdBy: adminId,
        ...valuesOf(input),
      },
    });
    return {
      before: { ...before, archivedAt: now, archivedBy: adminId },
      rule,
      overlaps: await this.overlapsOf(tx, rule),
    };
  }

  /** Remove = archive the current version, in `tx`. */
  async archive(
    tx: Prisma.TransactionClient,
    ruleId: string,
    adminId: string,
  ): Promise<InstallmentRuleWrite> {
    const before = await this.lockCurrent(tx, ruleId);
    const now = new Date();
    await this.archiveRow(tx, before.id, adminId, now);
    return {
      before,
      rule: { ...before, archivedAt: now, archivedBy: adminId },
      overlaps: [],
    };
  }

  /**
   * The option table an admin sees before saving: the latest rate snapshot
   * (fresh or not; its time is in the answer), the live rules of the segment
   * and, optionally, a draft rule priced as if it were live now and newest.
   * The keep guard is left out (no order exists).
   */
  async preview(
    query: InstallmentPreviewQuery,
    now: Date = new Date(),
  ): Promise<AdminInstallmentPreviewResponse> {
    if (!isPaytrCardFamily(query.family)) {
      throw new BadRequestException(
        i18nMessage("server.admin.installments.preview.familyInvalid"),
      );
    }
    if (query.draft) {
      assertValidRule({
        ...query.draft,
        name: "draft",
        validFrom: now.toISOString(),
        validUntil: null,
      });
    }
    const baseAmount = new Prisma.Decimal(query.amount).toDecimalPlaces(2);
    const snapshot = await this.rates.latest();
    const answer: AdminInstallmentPreviewResponse = {
      segment: query.segment,
      family: query.family,
      baseAmount: baseAmount.toNumber(),
      rateSnapshotId: snapshot?.id ?? null,
      fetchedAt: snapshot?.fetchedAt.toISOString() ?? null,
      rows: [],
    };
    if (!snapshot) return { ...answer, reason: "unavailable" };
    const offered = offeredInstallmentCounts(snapshot, query.family);
    if (offered.length === 0) return { ...answer, reason: "card_not_eligible" };

    const candidates = (await this.liveRules(query.segment, now)).filter(
      (rule) => rule.id !== query.replacesRuleId,
    );
    if (query.draft) {
      candidates.push({
        ...query.draft,
        id: DRAFT_RULE_ID,
        platformSharePct: new Prisma.Decimal(query.draft.platformSharePct),
        validFrom: new Date(now.getTime() - 1),
        validUntil: null,
        archivedAt: null,
        createdAt: now,
      });
    }

    const rows: AdminInstallmentPreviewRow[] = [];
    for (const { count, installmentRatePct } of offered) {
      const rule = resolveInstallmentRule(
        candidates,
        query.segment,
        count,
        now,
      );
      const base = {
        count,
        platformSharePct: rule.platformSharePct.toNumber(),
        ruleId: rule.ruleId,
      };
      if (!rule.allowed) {
        rows.push({ ...base, offered: false, ...NO_PRICE });
        continue;
      }
      try {
        const price = priceInstallment({
          baseAmount,
          count,
          singleRatePct: snapshot.singleRatePct,
          installmentRatePct,
          platformSharePct: rule.platformSharePct,
          feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
        });
        rows.push({
          ...base,
          offered: true,
          totalAmount: price.chargedAmount.toNumber(),
          feeAmount: price.feeAmount.toNumber(),
          monthlyAmount: price.monthlyAmount.toNumber(),
          platformCostAmount: price.platformCostAmount.toNumber(),
        });
      } catch (error: unknown) {
        if (!(error instanceof RangeError)) throw error;
        rows.push({ ...base, offered: false, ...NO_PRICE });
      }
    }
    return { ...answer, rows };
  }

  private async lockCurrent(
    tx: Prisma.TransactionClient,
    ruleId: string,
  ): Promise<InstallmentRule> {
    await tx.$queryRaw`SELECT id FROM installment_rules WHERE id = ${ruleId} FOR UPDATE`;
    const current = await tx.installmentRule.findUnique({
      where: { id: ruleId },
    });
    if (!current) {
      throw new NotFoundException(
        i18nMessage("server.admin.installments.rule.notFound"),
      );
    }
    if (current.archivedAt) {
      throw new ConflictException(
        i18nMessage("server.admin.installments.rule.notCurrent"),
      );
    }
    return current;
  }

  /** CAS on `archivedAt IS NULL`: a version is archived exactly once. */
  private async archiveRow(
    tx: Prisma.TransactionClient,
    id: string,
    adminId: string,
    at: Date,
  ): Promise<void> {
    const archived = await tx.installmentRule.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: at, archivedBy: adminId },
    });
    if (archived.count !== 1) {
      throw new ConflictException(
        i18nMessage("server.admin.installments.rule.notCurrent"),
      );
    }
  }

  private async overlapsOf(
    tx: Prisma.TransactionClient,
    rule: InstallmentRule,
  ): Promise<AdminInstallmentRuleRef[]> {
    const others = await tx.installmentRule.findMany({
      where: { archivedAt: null, NOT: { lineageId: rule.lineageId } },
      orderBy: { createdAt: "asc" },
    });
    return others
      .filter((other) => installmentRulesOverlap(rule, other))
      .map(({ id, lineageId, version, name }) => ({
        id,
        lineageId,
        version,
        name,
      }));
  }
}

/** The candidate id of a previewed draft (never a real uuid). */
export const DRAFT_RULE_ID = "draft";

const NO_PRICE = {
  totalAmount: null,
  feeAmount: null,
  monthlyAmount: null,
  platformCostAmount: null,
} as const;

/** 400 with the first violation's catalog key (the admin form shows all). */
function assertValidRule(input: InstallmentRuleInput): void {
  const [first] = validateInstallmentRule(input);
  if (first) {
    throw new BadRequestException(
      i18nMessage(installmentRuleViolationKey(first)),
    );
  }
}

function valuesOf(input: InstallmentRuleInput) {
  return {
    name: input.name.trim(),
    segment: input.segment,
    minCount: input.minCount,
    maxCount: input.maxCount,
    allowed: input.allowed,
    platformSharePct: new Prisma.Decimal(input.platformSharePct),
    priority: input.priority,
    validFrom: new Date(input.validFrom),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
  };
}

export function toAdminInstallmentRule(
  row: InstallmentRule,
  now: Date = new Date(),
): AdminInstallmentRule {
  return {
    id: row.id,
    lineageId: row.lineageId,
    version: row.version,
    name: row.name,
    segment: row.segment,
    minCount: row.minCount,
    maxCount: row.maxCount,
    allowed: row.allowed,
    platformSharePct: row.platformSharePct.toNumber(),
    priority: row.priority,
    validFrom: row.validFrom.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archivedBy: row.archivedBy,
    status: installmentRuleStatusOf(row, now),
  };
}
