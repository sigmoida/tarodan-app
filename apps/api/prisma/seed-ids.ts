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
export const PRODUCTION_REFERENCE_IDS = {
  taxRegion: "production-tax-region-tr",
  taxRateDefault: "production-tax-rate-kdv-20",
  taxRuleDefault: "production-tax-rule-default",
} as const;
