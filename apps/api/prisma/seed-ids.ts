/**
 * Seed'lerin paylaştığı TEK şey: deterministik kural seti kimlikleri.
 *
 * Bilinçli olarak ayrı bir dosyada duruyorlar. Demo (staging) rakamlarıyla
 * lansman/production rakamlarının aynı modülde yaşadığı düzen, demo senaryosunu
 * ayarlayan bir değişikliğin canlı fiyatlandırmayı sessizce değiştirmesine yol
 * açıyordu; `seed-independence.spec.ts` bunun geri gelmesini engelliyor.
 *
 * Kimlikler şema/API'nin UUID-v4 sözleşmesine uyar: deterministik olmaları
 * upsert'i idempotent tutarken checkout DTO doğrulamasını gevşetmeyi gerektirmez.
 */
export const SEED_COMMISSION_RULE_SET_IDS = {
  local: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1001",
  production: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1002",
  test: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1003",
  launch: "8d9fe2c4-a82e-4fc2-8b6d-5a4d1e9f1004",
} as const;

/**
 * Production referans satırlarının sabit kimlikleri. `seed-production.ts` bunları
 * oluşturur, `seed-launch.ts` AYNI satırları günceller — ayrı kimlik kullanmak
 * ikinci bir `isDefault` vergi bölgesi doğurur ve hangisinin geçerli olduğu
 * belirsizleşir.
 */
/**
 * Referans seed'in kurduğu vitrin içeriği (`seed-hero-content.ts`): sabit
 * kimlik, yeniden çalıştırmanın ikinci bir slayt/rozet doğurmasını engeller.
 */
export const HERO_SEED_IDS = {
  homeMarketplace: "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e01",
  authDefault: "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e02",
  authRegister: "6f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e03",
} as const;

export const TRUST_BADGE_SEED_IDS = {
  secureShopping: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c01",
  secureShipping: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c02",
  returns: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c03",
  installments: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c04",
  collection: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c05",
  trading: "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c06",
} as const;

export const PRODUCTION_REFERENCE_IDS = {
  taxRegion: "production-tax-region-tr",
  taxRateDefault: "production-tax-rate-kdv-20",
  taxRuleDefault: "production-tax-rule-default",
} as const;
