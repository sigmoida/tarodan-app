import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";

/**
 * Sipariş vergilendirme politikası — TEK kaynak ve TAMAMEN admin yapılandırması.
 *
 * Hiçbir oran koda gömülü değildir; buradaki varsayılanlar yalnız ilgili ayar
 * satırı hiç yokken (ör. taze kurulum) devreye girer. Ayarlar Sistem → Ayarlar
 * ekranından yönetilir.
 *
 * Stopaj oranı eskiden İKİ ayrı serviste kopyalanmıştı (checkout ve önizleme);
 * ikisi de artık buraya delege eder, böylece önizleme ile tahsilat ayrışamaz.
 */

export interface OrderTaxPolicy {
  /** Hizmet bedellerine (komisyon, hizmet bedeli, kargo payı) KDV uygulanır mı. */
  serviceVatEnabled: boolean;
  /** Hizmet KDV oranı (%). */
  serviceVatRate: number;
  /** E-ticaret stopaj oranı (%) — GVK 94/19. */
  withholdingRate: number;
  /**
   * Stopaj bireysel (vergi mükellefi olmayan) satıcıdan da kesilsin mi.
   * Varsayılan KAPALI: stopaj yalnız kurumsal satıcıdan kesilir.
   */
  withholdingAppliesToIndividual: boolean;
}

const SETTING_KEYS = [
  "service_vat_enabled",
  "service_vat_rate",
  "withholding_tax_rate",
  "withholding_applies_to_individual",
] as const;

const DEFAULTS: OrderTaxPolicy = {
  serviceVatEnabled: true,
  serviceVatRate: 20,
  withholdingRate: 1,
  withholdingAppliesToIndividual: false,
};

/** "true"/"1"/"yes" → true; ayar yoksa varsayılan. Bozuk değer varsayılana düşer. */
const asBoolean = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
};

/** Negatif ya da sayı olmayan oran varsayılana düşer — checkout NaN ile ilerlemez. */
const asRate = (raw: string | undefined, fallback: number): number => {
  if (raw == null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

@Injectable()
export class OrderTaxPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Politikanın tamamı TEK sorguda okunur (checkout başına beş round-trip değil). */
  async resolve(): Promise<OrderTaxPolicy> {
    const rows = await this.prisma.platformSetting.findMany({
      where: { settingKey: { in: [...SETTING_KEYS] } },
      select: { settingKey: true, settingValue: true },
    });
    const byKey = new Map(
      rows.map((row) => [row.settingKey, row.settingValue ?? undefined]),
    );

    return {
      serviceVatEnabled: asBoolean(
        byKey.get("service_vat_enabled"),
        DEFAULTS.serviceVatEnabled,
      ),
      serviceVatRate: asRate(
        byKey.get("service_vat_rate"),
        DEFAULTS.serviceVatRate,
      ),
      withholdingRate: asRate(
        byKey.get("withholding_tax_rate"),
        DEFAULTS.withholdingRate,
      ),
      withholdingAppliesToIndividual: asBoolean(
        byKey.get("withholding_applies_to_individual"),
        DEFAULTS.withholdingAppliesToIndividual,
      ),
    };
  }

  /** Hizmet KDV'si kapalıysa oran 0'dır — helper hiç KDV üretmez. */
  effectiveServiceVatRate(policy: OrderTaxPolicy): number {
    return policy.serviceVatEnabled ? policy.serviceVatRate : 0;
  }

  /**
   * Bu satıcıya uygulanacak stopaj oranı (%).
   * Bireysel satıcı varsayılan olarak kapsam DIŞIDIR — stopaj yalnız kurumsal
   * (onaylı işletme + VKN) satıcıdan kesilir. `withholding_applies_to_individual`
   * açılırsa herkese uygulanır.
   */
  withholdingRateFor(
    policy: OrderTaxPolicy,
    seller: { isCorporate: boolean },
  ): number {
    if (!seller.isCorporate && !policy.withholdingAppliesToIndividual) return 0;
    return policy.withholdingRate;
  }
}
