import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n/localized-message";
import { NETSIS_INVOICE_SETTING_DEFINITIONS } from "./netsis-invoice-settings";
import {
  checkNetsisSettingValue,
  describeNetsisSettings,
  type NetsisSettingState,
  type NetsisSettingsReadiness,
} from "./netsis-invoice-settings.validation";

export interface NetsisInvoiceSettingsState {
  settings: NetsisSettingState[];
  readiness: NetsisSettingsReadiness;
}

/** Değişen ayarların önce/sonra değerleri (yalnız gerçekten değişenler). */
export interface NetsisInvoiceSettingsChange {
  before: Record<string, string>;
  after: Record<string, string>;
}

export type NetsisInvoiceSettingsAfterWrite = (
  tx: Prisma.TransactionClient,
  change: NetsisInvoiceSettingsChange,
) => Promise<void>;

const SETTING_BY_KEY = new Map(
  NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => [row.key, row]),
);

/**
 * Netsis faturalama ayarlarının admin yüzü için okuma/yazma kapısı. Doğrulama
 * saf `netsis-invoice-settings.validation`'dadır (sağlayıcının ayrıştırıcısıyla
 * aynı kural); burada yalnız `PlatformSetting` satırları tek işlemde yazılır.
 * Denetim kaydı çağıran katmanın `afterWrite`'ıdır ve AYNI işlemde çalışır:
 * denetim yazılamazsa ayarlar da değişmez.
 */
@Injectable()
export class NetsisInvoiceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async state(): Promise<NetsisInvoiceSettingsState> {
    const rows = await this.prisma.platformSetting.findMany({
      where: { settingKey: { in: [...SETTING_BY_KEY.keys()] } },
      select: { settingKey: true, settingValue: true },
    });
    return describeNetsisSettings(
      new Map(rows.map((row) => [row.settingKey, row.settingValue])),
    );
  }

  /** Önce HEPSİ doğrulanır; tek bir hatalı anahtar hiçbir şeyin yazılmamasına yol açar. */
  async apply(
    values: Readonly<Record<string, unknown>>,
    actorUserId: string,
    afterWrite?: NetsisInvoiceSettingsAfterWrite,
  ): Promise<NetsisInvoiceSettingsChange> {
    const normalized = this.normalize(values);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformSetting.findMany({
        where: { settingKey: { in: Object.keys(normalized) } },
        select: { settingKey: true, settingValue: true },
      });
      const stored = new Map(
        existing.map((row) => [row.settingKey, row.settingValue]),
      );

      const change: NetsisInvoiceSettingsChange = { before: {}, after: {} };
      for (const [key, value] of Object.entries(normalized)) {
        const definition = SETTING_BY_KEY.get(key);
        if (!definition) continue;
        const before = stored.get(key) ?? definition.value;
        if (before === value) continue;
        await tx.platformSetting.upsert({
          where: { settingKey: key },
          update: { settingValue: value, updatedBy: actorUserId },
          create: {
            settingKey: key,
            settingValue: value,
            settingType: definition.type,
            description: definition.description,
            updatedBy: actorUserId,
          },
        });
        change.before[key] = before;
        change.after[key] = value;
      }

      if (Object.keys(change.after).length > 0) {
        await afterWrite?.(tx, change);
      }
      return change;
    });
  }

  private normalize(
    values: Readonly<Record<string, unknown>>,
  ): Record<string, string> {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new BadRequestException(
        i18nMessage("server.admin.invoicingSettings.empty"),
      );
    }
    const normalized: Record<string, string> = {};
    for (const [key, raw] of entries) {
      const check = checkNetsisSettingValue(key, raw);
      if (!check.ok) {
        throw new BadRequestException(
          i18nMessage(
            check.reason === "unknown"
              ? "server.admin.invoicingSettings.unknownKey"
              : "server.admin.invoicingSettings.invalidValue",
            { key },
          ),
        );
      }
      normalized[key] = check.value;
    }
    return normalized;
  }
}
