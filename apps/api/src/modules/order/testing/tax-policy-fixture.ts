import { OrderTaxPolicyService } from "../order-tax-policy.service";

/**
 * Testlerde kullanılacak vergi politikası — kendi prisma sahtesini taşır, böylece
 * her spec'in kendi mock'una `platformSetting.findMany` eklemesi gerekmez.
 *
 * Argümansız çağrı ÜRETİM VARSAYILANLARINI verir: ürün KDV'si kapalı, hizmet
 * KDV'si %20 açık, stopaj %1 (bireysel dahil).
 */
export const testTaxPolicy = (
  settings: Record<string, string> = {},
): OrderTaxPolicyService =>
  new OrderTaxPolicyService({
    platformSetting: {
      findMany: async () =>
        Object.entries(settings).map(([settingKey, settingValue]) => ({
          settingKey,
          settingValue,
        })),
    },
  } as any);

/** Hizmet KDV'sini kapatır — KDV öncesi davranışı ölçen testler için. */
export const noVatTaxPolicy = (): OrderTaxPolicyService =>
  testTaxPolicy({
    service_vat_enabled: "false",
    withholding_applies_to_individual: "false",
  });
