import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  INSTALLMENT_SETTINGS,
  parseInstallmentMinAmount,
  parseInstallmentsEnabled,
  validateInstallmentMinAmount,
  type AdminInstallmentSettingsPatch,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";

/** The two installment settings as the code reads them. */
export interface InstallmentSettings {
  /** The master and kill switch (`installments_enabled`). */
  enabled: boolean;
  /** Minimum goods total T, TL (`installment_min_amount`). */
  minAmount: Prisma.Decimal;
}

/** One setting row a write changed (the audit subject). */
export interface InstallmentSettingChange {
  settingKey: string;
  settingId: string;
  before: string | null;
  after: string;
}

type SettingDb = Pick<PrismaService, "platformSetting">;

const KEYS = [
  INSTALLMENT_SETTINGS.enabled.key,
  INSTALLMENT_SETTINGS.minAmount.key,
] as const;

const DESCRIPTION: Record<(typeof KEYS)[number], string> = {
  installments_enabled:
    "Installment payments on (kill switch; no row = off). Written only from Finance > Installments.",
  installment_min_amount:
    "Minimum goods total in TL for installments (no row = 500). Written only from Finance > Installments.",
};

/**
 * Reads and writes `installments_enabled` and `installment_min_amount`
 * (PlatformSetting rows; definitions in `@tarodan/types`). A missing row is
 * the default: off, 500 TL. No cache: one indexed read per options or
 * signing call, so the kill switch acts at once.
 *
 * Writes run in the caller's transaction (the admin service adds the audit
 * row in the same transaction); the generic `PATCH /admin/settings` refuses
 * these keys.
 */
@Injectable()
export class InstallmentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async read(db: SettingDb = this.prisma): Promise<InstallmentSettings> {
    const rows = await db.platformSetting.findMany({
      where: { settingKey: { in: [...KEYS] } },
      select: { settingKey: true, settingValue: true },
    });
    const value = (key: string) =>
      rows.find((row) => row.settingKey === key)?.settingValue;
    return {
      enabled: parseInstallmentsEnabled(
        value(INSTALLMENT_SETTINGS.enabled.key),
      ),
      minAmount: new Prisma.Decimal(
        parseInstallmentMinAmount(value(INSTALLMENT_SETTINGS.minAmount.key)),
      ),
    };
  }

  /**
   * Validates and writes the patch inside `tx`. Only values that change are
   * written; the answer lists them (empty = nothing changed). 400 on an
   * invalid minimum amount.
   */
  async update(
    tx: Prisma.TransactionClient,
    patch: AdminInstallmentSettingsPatch,
    updatedBy: string,
  ): Promise<InstallmentSettingChange[]> {
    const next: Array<{
      key: (typeof KEYS)[number];
      value: string;
      type: string;
    }> = [];
    if (patch.enabled !== undefined) {
      next.push({
        key: INSTALLMENT_SETTINGS.enabled.key,
        value: patch.enabled ? "true" : "false",
        type: "boolean",
      });
    }
    if (patch.minAmount !== undefined) {
      const violation = validateInstallmentMinAmount(patch.minAmount);
      if (violation) {
        throw new BadRequestException(
          i18nMessage(`server.admin.installments.minAmount.${violation.code}`, {
            min: INSTALLMENT_SETTINGS.minAmount.min,
            max: INSTALLMENT_SETTINGS.minAmount.max,
            decimals: INSTALLMENT_SETTINGS.minAmount.decimals,
          }),
        );
      }
      next.push({
        key: INSTALLMENT_SETTINGS.minAmount.key,
        value: patch.minAmount.toFixed(INSTALLMENT_SETTINGS.minAmount.decimals),
        type: "number",
      });
    }
    if (next.length === 0) return [];

    const before = await this.read(tx);
    const changes: InstallmentSettingChange[] = [];
    for (const { key, value, type } of next) {
      const unchanged =
        key === INSTALLMENT_SETTINGS.enabled.key
          ? before.enabled === (value === "true")
          : before.minAmount.equals(new Prisma.Decimal(value));
      if (unchanged) continue;
      const existing = await tx.platformSetting.findUnique({
        where: { settingKey: key },
        select: { settingValue: true },
      });
      const row = await tx.platformSetting.upsert({
        where: { settingKey: key },
        create: {
          settingKey: key,
          settingValue: value,
          settingType: type,
          description: DESCRIPTION[key],
          updatedBy,
        },
        update: { settingValue: value, updatedBy },
        select: { id: true },
      });
      changes.push({
        settingKey: key,
        settingId: row.id,
        before: existing?.settingValue ?? null,
        after: value,
      });
    }
    return changes;
  }
}
