import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../prisma";
import { paytrReportSyncEnabled } from "../../../config/paytr";

export type PaytrSyncJob = "statement" | "settlement";

export interface PaytrSyncRun {
  at: string;
  status: "ok" | "error" | "disabled";
  fetched?: number;
  upserted?: number;
  matched?: number;
  error?: string;
}

export interface PaytrSyncState {
  enabled: boolean;
  statement: PaytrSyncRun | null;
  settlement: PaytrSyncRun | null;
  /** Son başarılı döküm senkronu 36 saati aştı (gece cron'u kaçmış). */
  stale: boolean;
}

const KEY: Record<PaytrSyncJob, string> = {
  statement: "paytr_sync.statement.last",
  settlement: "paytr_sync.settlement.last",
};
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

/**
 * Son senkron çalışmasının kalıcı izi. CronTracker bellekte kalır ve dışarı
 * açılmaz; admin PSP ekranı "bayrak kapalı / dün çöktü / bayat / gerçekten boş"
 * durumlarını ayırt edemiyordu. Şema değişmez: PlatformSetting'e JSON yazılır.
 */
@Injectable()
export class PaytrSyncStateService {
  private readonly logger = new Logger(PaytrSyncStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  enabled(): boolean {
    return paytrReportSyncEnabled(this.config);
  }

  async recordRun(job: PaytrSyncJob, run: Omit<PaytrSyncRun, "at">) {
    const value: PaytrSyncRun = { at: new Date().toISOString(), ...run };
    try {
      await this.prisma.platformSetting.upsert({
        where: { settingKey: KEY[job] },
        create: {
          settingKey: KEY[job],
          settingValue: JSON.stringify(value),
          settingType: "json",
          description: `PayTR ${job} senkronu son çalışma (otomatik)`,
        },
        update: { settingValue: JSON.stringify(value) },
      });
    } catch (error: any) {
      // İz yazılamaması senkronu düşürmesin.
      this.logger.warn(`PayTR sync izi yazılamadı (${job}): ${error?.message}`);
    }
  }

  async getState(): Promise<PaytrSyncState> {
    const rows = await this.prisma.platformSetting.findMany({
      where: { settingKey: { in: Object.values(KEY) } },
      select: { settingKey: true, settingValue: true },
    });
    const parse = (job: PaytrSyncJob): PaytrSyncRun | null => {
      const raw = rows.find((r) => r.settingKey === KEY[job])?.settingValue;
      if (!raw) return null;
      try {
        return JSON.parse(raw) as PaytrSyncRun;
      } catch {
        return null;
      }
    };
    const statement = parse("statement");
    const settlement = parse("settlement");
    const enabled = this.enabled();
    const lastOk =
      statement?.status === "ok" ? new Date(statement.at).getTime() : null;
    const stale =
      enabled && (lastOk === null || Date.now() - lastOk > STALE_AFTER_MS);
    return { enabled, statement, settlement, stale };
  }
}
