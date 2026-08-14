import { OrderTaxPolicyService } from "./order-tax-policy.service";

/**
 * Vergi politikası TAMAMEN admin yapılandırmasıdır — hiçbir oran/anahtar koda
 * gömülü değildir. Varsayılanlar yalnız ayar satırı hiç yoksa devreye girer.
 */
describe("OrderTaxPolicyService", () => {
  const makeService = (settings: Record<string, string> = {}) => {
    const rows = Object.entries(settings).map(([settingKey, settingValue]) => ({
      settingKey,
      settingValue,
    }));
    const prisma = {
      platformSetting: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return {
      service: new OrderTaxPolicyService(prisma as any),
      prisma,
    };
  };

  it("varsayılanlar: hizmet KDV'si %20 AÇIK, stopaj %1 yalnız kurumsal", async () => {
    const { service } = makeService();

    await expect(service.resolve()).resolves.toEqual({
      serviceVatEnabled: true,
      serviceVatRate: 20,
      withholdingRate: 1,
      withholdingAppliesToIndividual: false,
    });
  });

  it("admin ayarları varsayılanları ezer", async () => {
    const { service } = makeService({
      service_vat_enabled: "false",
      service_vat_rate: "10",
      withholding_tax_rate: "2.5",
      withholding_applies_to_individual: "false",
    });

    await expect(service.resolve()).resolves.toEqual({
      serviceVatEnabled: false,
      serviceVatRate: 10,
      withholdingRate: 2.5,
      withholdingAppliesToIndividual: false,
    });
  });

  it("hizmet KDV'si kapalıysa efektif oran 0'dır (helper KDV üretmez)", async () => {
    const { service } = makeService({
      service_vat_enabled: "false",
      service_vat_rate: "20",
    });

    const policy = await service.resolve();
    expect(service.effectiveServiceVatRate(policy)).toBe(0);
  });

  it("hizmet KDV'si açıkken efektif oran ayardaki orandır", async () => {
    const { service } = makeService({ service_vat_rate: "18" });

    const policy = await service.resolve();
    expect(service.effectiveServiceVatRate(policy)).toBe(18);
  });

  it("stopaj: varsayılanda yalnız kurumsal satıcıdan kesilir", async () => {
    const { service } = makeService();
    const policy = await service.resolve();

    expect(service.withholdingRateFor(policy, { isCorporate: false })).toBe(0);
    expect(service.withholdingRateFor(policy, { isCorporate: true })).toBe(1);
  });

  it("stopaj: ayar açılırsa bireysel satıcıdan da kesilir", async () => {
    const { service } = makeService({
      withholding_applies_to_individual: "true",
    });
    const policy = await service.resolve();

    expect(service.withholdingRateFor(policy, { isCorporate: false })).toBe(1);
    expect(service.withholdingRateFor(policy, { isCorporate: true })).toBe(1);
  });

  it("bozuk değerler varsayılana düşer — checkout asla NaN ile ilerlemez", async () => {
    const { service } = makeService({
      service_vat_rate: "abc",
      withholding_tax_rate: "-3",
    });

    const policy = await service.resolve();
    expect(policy.serviceVatRate).toBe(20);
    expect(policy.withholdingRate).toBe(1);
  });

  it("tüm ayarlar TEK sorguda okunur (checkout başına 5 round-trip değil)", async () => {
    const { service, prisma } = makeService();

    await service.resolve();

    expect(prisma.platformSetting.findMany).toHaveBeenCalledTimes(1);
  });
});
