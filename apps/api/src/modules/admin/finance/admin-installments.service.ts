import { Injectable } from "@nestjs/common";
import type { InstallmentRule, Prisma } from "@prisma/client";
import type {
  AdminInstallmentPreviewResponse,
  AdminInstallmentRatesInfo,
  AdminInstallmentRule,
  AdminInstallmentRuleWriteResponse,
  AdminInstallmentSettings,
  AdminInstallmentSettingsPatch,
  InstallmentRuleInput,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { AdminAuditService } from "../ops/admin-audit.service";
import { InstallmentSettingsService } from "../../payment/installments/installment-settings.service";
import { InstallmentRatesService } from "../../payment/installments/installment-rates.service";
import {
  InstallmentRulesService,
  toAdminInstallmentRule,
  type InstallmentRuleWrite,
} from "../../payment/installments/installment-rules.service";
import { INSTALLMENT_RATES_MAX_AGE_MS } from "../../payment/installments/installment-config";
import { rateFamiliesOf } from "../../payment/installments/installment-eligibility";
import type { InstallmentPreviewQueryDto } from "./dto/installments.dto";

/** AuditLog entity type of a rule version. */
const RULE_ENTITY = "installment_rule";

/**
 * Admin Finance > Installments. Thin orchestration over the payment
 * module's installment services: every write runs in one transaction with
 * its required (fail-closed) audit row, so a setting or rule never changes
 * without its audit. Who may write is the controller's `@Roles`.
 */
@Injectable()
export class AdminInstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly settings: InstallmentSettingsService,
    private readonly rates: InstallmentRatesService,
    private readonly rules: InstallmentRulesService,
  ) {}

  async getSettings(): Promise<AdminInstallmentSettings> {
    const [{ enabled, minAmount }, rates] = await Promise.all([
      this.settings.read(),
      this.ratesInfo(),
    ]);
    return { enabled, minAmount: minAmount.toNumber(), rates };
  }

  async updateSettings(
    userId: string,
    patch: AdminInstallmentSettingsPatch,
  ): Promise<AdminInstallmentSettings> {
    await this.prisma.$transaction(async (tx) => {
      const adminId = await this.audit.resolveActiveAdminId(userId, tx);
      const changes = await this.settings.update(tx, patch, adminId);
      for (const change of changes) {
        await this.audit.createRequiredAuditLog(
          userId,
          "installment_setting_update",
          "platform_setting",
          change.settingId,
          { settingKey: change.settingKey, value: change.before },
          { settingKey: change.settingKey, value: change.after },
          tx,
        );
      }
    });
    return this.getSettings();
  }

  listRules(): Promise<AdminInstallmentRule[]> {
    return this.rules.list();
  }

  createRule(
    userId: string,
    input: InstallmentRuleInput,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.writeRule(userId, "installment_rule_create", (tx, adminId) =>
      this.rules.create(tx, input, adminId),
    );
  }

  createRuleVersion(
    userId: string,
    ruleId: string,
    input: InstallmentRuleInput,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.writeRule(userId, "installment_rule_version", (tx, adminId) =>
      this.rules.createVersion(tx, ruleId, input, adminId),
    );
  }

  archiveRule(
    userId: string,
    ruleId: string,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    return this.writeRule(userId, "installment_rule_archive", (tx, adminId) =>
      this.rules.archive(tx, ruleId, adminId),
    );
  }

  preview(
    query: InstallmentPreviewQueryDto,
  ): Promise<AdminInstallmentPreviewResponse> {
    const hasDraft = query.draftMinCount !== undefined;
    return this.rules.preview({
      segment: query.segment,
      amount: query.amount,
      family: query.family,
      replacesRuleId: query.replacesRuleId,
      draft: hasDraft
        ? {
            segment: query.draftSegment ?? query.segment,
            minCount: query.draftMinCount as number,
            maxCount: query.draftMaxCount ?? (query.draftMinCount as number),
            allowed: query.draftAllowed ?? true,
            platformSharePct: query.draftPlatformSharePct ?? 0,
            priority: query.draftPriority ?? 0,
          }
        : undefined,
    });
  }

  private async writeRule(
    userId: string,
    action: string,
    write: (
      tx: Prisma.TransactionClient,
      adminId: string,
    ) => Promise<InstallmentRuleWrite>,
  ): Promise<AdminInstallmentRuleWriteResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      const adminId = await this.audit.resolveActiveAdminId(userId, tx);
      const written = await write(tx, adminId);
      await this.audit.createRequiredAuditLog(
        userId,
        action,
        RULE_ENTITY,
        written.rule.id,
        written.before ? auditValuesOf(written.before) : null,
        auditValuesOf(written.rule),
        tx,
      );
      return written;
    });
    return {
      rule: toAdminInstallmentRule(result.rule),
      overlaps: result.overlaps,
    };
  }

  private async ratesInfo(): Promise<AdminInstallmentRatesInfo> {
    const latest = await this.rates.latest();
    if (!latest) {
      return {
        rateSnapshotId: null,
        fetchedAt: null,
        fresh: false,
        maxInstallmentNonBusiness: null,
        families: [],
      };
    }
    return {
      rateSnapshotId: latest.id,
      fetchedAt: latest.fetchedAt.toISOString(),
      fresh:
        Date.now() - latest.fetchedAt.getTime() < INSTALLMENT_RATES_MAX_AGE_MS,
      maxInstallmentNonBusiness: latest.maxInstallmentNonBusiness,
      families: rateFamiliesOf(latest.rates),
    };
  }
}

/** The audited values of a version (ids, rule fields, archive stamps). */
function auditValuesOf(rule: InstallmentRule) {
  return {
    id: rule.id,
    lineageId: rule.lineageId,
    version: rule.version,
    name: rule.name,
    segment: rule.segment,
    minCount: rule.minCount,
    maxCount: rule.maxCount,
    allowed: rule.allowed,
    platformSharePct: rule.platformSharePct.toString(),
    priority: rule.priority,
    validFrom: rule.validFrom.toISOString(),
    validUntil: rule.validUntil?.toISOString() ?? null,
    archivedAt: rule.archivedAt?.toISOString() ?? null,
    archivedBy: rule.archivedBy,
  };
}
