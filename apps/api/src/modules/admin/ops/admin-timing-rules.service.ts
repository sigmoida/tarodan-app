import { Injectable } from "@nestjs/common";
import type { AdminTimingRulesResponse } from "@tarodan/types";
import {
  TimingRulesService,
  type TimingRuleChangeInput,
} from "../../timing-rules/timing-rules.service";
import { AdminAuditService } from "./admin-audit.service";

/**
 * Süreler ve Kurallar ekranının admin yüzü. Yazma domain servisinden geçer
 * (§1: admin yazmaları domain servisine gider); bu katman yalnız ZORUNLU
 * denetim kaydını ekler — her değişen kayıt için önce/sonra çiftiyle bir
 * `timing_rule_update` satırı. Denetim, ayar yazımıyla AYNI işlemde yazılır
 * (`afterWrite`): denetim yazılamazsa süreler de değişmez — "değişti ama
 * kaydı yok" durumu oluşamaz.
 */
@Injectable()
export class AdminTimingRulesService {
  constructor(
    private readonly timingRules: TimingRulesService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(): Promise<AdminTimingRulesResponse> {
    return { rules: await this.timingRules.listStates() };
  }

  async update(
    adminUserId: string,
    changes: readonly TimingRuleChangeInput[],
  ): Promise<AdminTimingRulesResponse> {
    await this.timingRules.applyChanges(
      changes,
      adminUserId,
      async (tx, applied) => {
        for (const change of applied) {
          await this.audit.createRequiredAuditLog(
            adminUserId,
            "timing_rule_update",
            "TimingRule",
            change.id,
            change.before,
            change.after,
            tx,
          );
        }
      },
    );
    return this.list();
  }
}
