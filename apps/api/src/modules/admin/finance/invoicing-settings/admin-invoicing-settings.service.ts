import { Injectable } from "@nestjs/common";
import type { EInvoiceProviderName } from "@prisma/client";
import type { Locale, MessageKey } from "@tarodan/i18n";
import { invoiceProviderName } from "../../../../config/invoice-provider";
import {
  netsisConfig,
  netsisEnabled,
  type NetsisMode,
} from "../../../../config/netsis";
import { translateMessage } from "../../../i18n/translate";
import { localizedPayloadOf } from "../../../i18n/localized-message";
import {
  NETSIS_FEE_INVOICE_TYPES,
  netsisItemSettingKey,
} from "../../../invoicing/provider/netsis-invoice-settings";
import {
  NetsisInvoiceSettingsService,
  type NetsisInvoiceSettingsState,
} from "../../../invoicing/provider/netsis-invoice-settings.service";
import { NetsisClientFacade } from "../../../netsis/netsis-client.facade";
import { classifyNetsisError } from "../../../netsis/http/netsis-error";
import { AdminAuditService } from "../../ops/admin-audit.service";

export interface InvoicingSettingsFeeType {
  type: string;
  /** Ayarın anahtarı — ekran girdiyi bu anahtarla eşler. */
  settingKey: string;
  /** Mevcut fatura türü etiketi (admin.finance.invoices.types.*). */
  labelKey: string;
}

export interface AdminInvoicingSettingsResponse
  extends NetsisInvoiceSettingsState {
  provider: EInvoiceProviderName;
  netsisEnabled: boolean;
  netsisMode: NetsisMode;
  feeTypes: InvoicingSettingsFeeType[];
}

export interface NetsisPingReport {
  ok: boolean;
  mode: NetsisMode;
  version?: string | null;
  authenticated?: boolean;
  error?: string;
}

/** `seller_commission` → `sellerCommission` (katalogdaki fatura türü anahtarı). */
function typeLabelKey(type: string): string {
  const camel = type.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return `admin.finance.invoices.types.${camel}`;
}

function feeType(type: Parameters<typeof netsisItemSettingKey>[0]) {
  return {
    type,
    settingKey: netsisItemSettingKey(type),
    labelKey: typeLabelKey(type),
  };
}

/**
 * Faturalama Ayarları ekranının admin yüzü. Ayar yazımı domain servisinden
 * geçer (§1); bu katman yalnız ZORUNLU denetim kaydını (önce/sonra) AYNI
 * işlemde ekler ve salt-okunur ortam bilgisini (sağlayıcı, Netsis modu) toplar.
 */
@Injectable()
export class AdminInvoicingSettingsService {
  constructor(
    private readonly settings: NetsisInvoiceSettingsService,
    private readonly netsis: NetsisClientFacade,
    private readonly audit: AdminAuditService,
  ) {}

  async get(): Promise<AdminInvoicingSettingsResponse> {
    return {
      provider: invoiceProviderName(),
      netsisEnabled: netsisEnabled(),
      netsisMode: netsisConfig().mode,
      ...(await this.settings.state()),
      // Ürün satışı ücret değildir ama kendi kartı vardır: ekran tek listeden çizer.
      feeTypes: [
        feeType("platform_sale"),
        ...NETSIS_FEE_INVOICE_TYPES.map(feeType),
      ],
    };
  }

  async update(
    adminUserId: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<AdminInvoicingSettingsResponse> {
    await this.settings.apply(values, adminUserId, async (tx, change) => {
      await this.audit.createRequiredAuditLog(
        adminUserId,
        "netsis_invoice_settings_update",
        "NetsisInvoiceSettings",
        "netsis",
        change.before,
        change.after,
        tx,
      );
    });
    return this.get();
  }

  /** Ham taşıma hatası dışarı sızmaz: `ok:false` + istek dilinde mesaj. */
  async ping(locale: Locale): Promise<NetsisPingReport> {
    try {
      const result = await this.netsis.ping();
      return {
        ok: true,
        mode: result.mode,
        version: result.version,
        authenticated: result.authenticated,
      };
    } catch (error) {
      const payload = localizedPayloadOf(error);
      const key: MessageKey =
        payload?.i18nKey ?? `server.netsis.error.${classifyNetsisError(error)}`;
      return {
        ok: false,
        mode: netsisConfig().mode,
        error: translateMessage(key, locale, payload?.i18nParams),
      };
    }
  }
}
