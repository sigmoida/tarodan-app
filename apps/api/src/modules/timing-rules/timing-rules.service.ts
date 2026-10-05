import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  PUBLIC_TIMING_RULE_IDS,
  TIMING_RULES,
  findTimingInvariantViolation,
  isTimingRuleId,
  timingActionSettingKey,
  validateTimingAction,
  validateTimingValue,
  type AdminTimingRuleState,
  type PublicTimingPolicy,
  type TimingInvariantId,
  type TimingRuleId,
  type TimingRuleViolation,
} from "@tarodan/types";
import type { MessageKey } from "@tarodan/i18n";
import { PrismaService } from "../../prisma";
import { i18nMessage } from "../i18n";
import {
  loadTimingRuleStates,
  timingValuesOf,
} from "../../common/timing-rules";

/** Sunucuya gelen tek değişiklik (DTO şekli; eylem henüz doğrulanmamış). */
export interface TimingRuleChangeInput {
  id: string;
  value?: number;
  action?: string;
}

/** Uygulanmış değişiklik — denetim kaydının önce/sonra çifti. */
export interface AppliedTimingRuleChange {
  id: TimingRuleId;
  before: AdminTimingRuleState;
  after: AdminTimingRuleState;
}

const INVARIANT_MESSAGE: Record<TimingInvariantId, MessageKey> = {
  dropoffHardNotBelowDropoff:
    "server.admin.timingRules.invariant.dropoffHardNotBelowDropoff",
  listingWarningBeforeTtl:
    "server.admin.timingRules.invariant.listingWarningBeforeTtl",
};

/** Kayıt ihlalini yerelleştirilmiş 400'e çevirir. */
function violationError(violation: TimingRuleViolation): BadRequestException {
  switch (violation.code) {
    case "notInteger":
      return new BadRequestException(
        i18nMessage("server.admin.timingRules.notInteger"),
      );
    case "belowMin":
      return new BadRequestException(
        i18nMessage("server.admin.timingRules.belowMin", {
          min: violation.min,
        }),
      );
    case "aboveMax":
      return new BadRequestException(
        i18nMessage("server.admin.timingRules.aboveMax", {
          max: violation.max,
        }),
      );
    case "invariant":
      return new BadRequestException(
        i18nMessage(INVARIANT_MESSAGE[violation.invariant]),
      );
    case "actionNotAllowed":
      return new BadRequestException(
        i18nMessage("server.admin.timingRules.actionNotAllowed"),
      );
    case "actionUnavailable":
      return new BadRequestException(
        i18nMessage("server.admin.timingRules.actionUnavailable"),
      );
  }
}

/**
 * Süreler ve Kurallar — iş sürelerinin admin tarafından okunan/yazılan TEK
 * yüzeyi. Okuma `common/timing-rules` üzerindendir (ayar → env → varsayılan);
 * yazma burada, doğrulamalı ve atomiktir:
 *   - değer tam sayı ve kayıt sınırları içinde olmalı,
 *   - alanlar arası değişmezler (drop-off ≤ emniyet supabı, uyarı < ilan
 *     ömrü) değişikliklerin TAMAMI uygulanmış aday değerler üzerinde
 *     denetlenir — iki ilişkili alan tek istekte birlikte değiştirilebilir,
 *   - eylem kayıtta tanımlı ve AÇIK olmalı (henüz yazılmamış davranışlar
 *     doğrudan gönderilse bile reddedilir).
 * Okuma + doğrulama + yazma Serializable tek işlemde yürür: aynı anda iki
 * admin ilişkili iki alanı değiştirirse ikisi birden değişmezi bozamaz.
 *
 * Denetim kaydı admin katmanındadır (AdminTimingRulesService); bu servis
 * önce/sonra çiftini döndürür.
 */
@Injectable()
export class TimingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Tüm kayıtların etkin durumu (değer, kaynak, eylem, son güncelleme). */
  listStates(): Promise<AdminTimingRuleState[]> {
    return loadTimingRuleStates(this.prisma, this.config);
  }

  /** Ön yüzlerin okuyabileceği hassas olmayan süreler (`PUBLIC_TIMING_RULE_IDS`). */
  async publicPolicy(): Promise<PublicTimingPolicy> {
    const values = timingValuesOf(await this.listStates());
    return Object.fromEntries(
      PUBLIC_TIMING_RULE_IDS.map((id) => [
        id,
        { value: values[id], unit: TIMING_RULES[id].unit },
      ]),
    ) as PublicTimingPolicy;
  }

  /**
   * Değişiklikleri doğrular ve tek işlemde yazar. Herhangi biri geçersizse
   * hiçbiri yazılmaz.
   */
  async applyChanges(
    changes: readonly TimingRuleChangeInput[],
    actorUserId: string,
  ): Promise<AppliedTimingRuleChange[]> {
    const ids = this.assertChangeShape(changes);

    return this.prisma.$transaction(
      async (tx) => {
        const before = this.byId(await loadTimingRuleStates(tx, this.config));
        const candidate: Record<TimingRuleId, number> = {
          ...timingValuesOf(Object.values(before)),
        };

        for (const [index, change] of changes.entries()) {
          const id = ids[index];
          if (change.value !== undefined) {
            const violation = validateTimingValue(id, change.value);
            if (violation) throw violationError(violation);
            candidate[id] = change.value;
          }
          if (change.action !== undefined) {
            const violation = validateTimingAction(id, change.action);
            if (violation) throw violationError(violation);
          }
        }

        const valueIds = ids.filter(
          (_, index) => changes[index].value !== undefined,
        );
        const crossField = findTimingInvariantViolation(candidate, valueIds);
        if (crossField) throw violationError(crossField.violation);

        for (const [index, change] of changes.entries()) {
          const id = ids[index];
          if (change.value !== undefined) {
            await this.upsertSetting(
              tx,
              TIMING_RULES[id].settingKey,
              String(change.value),
              "number",
              actorUserId,
            );
          }
          if (change.action !== undefined) {
            await this.upsertSetting(
              tx,
              timingActionSettingKey(id),
              change.action,
              "string",
              actorUserId,
            );
          }
        }

        const after = this.byId(await loadTimingRuleStates(tx, this.config));
        return ids.map((id) => ({ id, before: before[id], after: after[id] }));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Şekil kuralları: bilinen kayıt, kayıt başına tek değişiklik, en az bir
   * alan. DTO aynısını söyler; servis doğrudan çağrılsa da gevşemesin diye
   * burada da denetlenir.
   */
  private assertChangeShape(
    changes: readonly TimingRuleChangeInput[],
  ): TimingRuleId[] {
    if (changes.length === 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.timingRules.emptyChange"),
      );
    }
    const seen = new Set<string>();
    return changes.map((change) => {
      if (!isTimingRuleId(change.id)) {
        throw new BadRequestException(
          i18nMessage("server.admin.timingRules.unknownRule"),
        );
      }
      if (seen.has(change.id)) {
        throw new BadRequestException(
          i18nMessage("server.admin.timingRules.duplicateRule"),
        );
      }
      seen.add(change.id);
      if (change.value === undefined && change.action === undefined) {
        throw new BadRequestException(
          i18nMessage("server.admin.timingRules.emptyChange"),
        );
      }
      return change.id;
    });
  }

  private byId(
    states: readonly AdminTimingRuleState[],
  ): Record<TimingRuleId, AdminTimingRuleState> {
    return Object.fromEntries(
      states.map((state) => [state.id, state]),
    ) as Record<TimingRuleId, AdminTimingRuleState>;
  }

  private upsertSetting(
    tx: Prisma.TransactionClient,
    settingKey: string,
    settingValue: string,
    settingType: "number" | "string",
    actorUserId: string,
  ) {
    return tx.platformSetting.upsert({
      where: { settingKey },
      update: { settingValue, updatedBy: actorUserId },
      create: {
        settingKey,
        settingValue,
        settingType,
        updatedBy: actorUserId,
        description: "Süreler ve Kurallar",
      },
    });
  }
}
