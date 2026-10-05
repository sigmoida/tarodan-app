import { readFileSync } from "fs";
import { apiAppRoot } from "./app-root";
import { join } from "path";

/**
 * Canlı seed'lerinin demo (staging/yerel) rakamlarından bağımsız kaldığını
 * doğrular.
 *
 * Geçmişi: production seed'i komisyon oranlarını ortak config'ten alıyordu;
 * oradaki değerler yerel "Araba" senaryosu için yazılmıştı ve canlıda her aktif
 * kategoriye ACTIVE olarak yayınlanıyordu. Demo senaryosunu ayarlayan bir
 * commit, kimse fark etmeden canlı komisyonu değiştirebiliyordu.
 *
 * Bu test bir kod incelemesi kuralını makineye devreder: kimse "sadece şu
 * profilleri yeniden kullanayım" diye o bağı geri kuramaz.
 */
const PRISMA_DIR = join(apiAppRoot(), "prisma");
const read = (file: string) => readFileSync(join(PRISMA_DIR, file), "utf8");

/** Yalnız gerçek modül belirteçleri — yorumdaki dosya adları sayılmaz. */
const importedModules = (source: string): string[] =>
  [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);

const DEMO_MODULES = [
  "./seed",
  "./seed-demo-config",
  "./seed-commerce",
  "./seed-media",
];
// UAT seed'i ve paylaşılan lansman çekirdeği de demo katmanına bağlanamaz;
// görselleri `seed-media.ts` ayrı bir adım olarak workflow'dan bağlanır, import
// edilmez.
const PRODUCTION_SEEDS = [
  "seed-production.ts",
  "seed-launch.ts",
  "seed-launch-core.ts",
  "seed-uat.ts",
];

describe("production seeds are independent of the demo seed", () => {
  it.each(PRODUCTION_SEEDS)("%s imports no demo module", (file) => {
    expect(importedModules(read(file))).toEqual(
      expect.not.arrayContaining(DEMO_MODULES),
    );
  });

  it("keeps the shared id module free of business values", () => {
    // Kimlik modülü yalnız sabit dizeler taşımalı; sayısal bir değer oraya
    // sızdıysa iş verisi kimliklerin arasına karışmış demektir.
    const source = read("seed-ids.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/[:=]\s*-?\d/);
  });

  it("leaves commission pricing out of the boot-time reference seed", () => {
    // seed-production her container açılışında koşar. Komisyon oranı yazması,
    // adminin yayınladığı seti sessizce ezme riski demektir.
    const source = read("seed-production.ts");
    expect(source).not.toContain("prisma.commissionRule");
    expect(source).not.toContain("prisma.commissionRuleSet");
  });

  it("keeps the boot-time reference seed from overwriting business values", () => {
    const source = read("seed-production.ts");
    // Platform servis hesabı bilinçli istisna (bkz. dosyadaki yorum); geri kalan
    // her upsert'in update dalı boş olmalı.
    const upserts = source.split("prisma.").slice(1);
    const businessValueWrites = upserts.filter((chunk) =>
      /^(membershipTier|taxRegion|taxRate|taxRule|shippingTariff)\.upsert/.test(
        chunk,
      ),
    );
    expect(businessValueWrites).toHaveLength(5);
    for (const chunk of businessValueWrites) {
      expect(chunk).toContain("update: {}");
    }
  });

  it("sources every launch business value from the data files", () => {
    // Rakamlar JSON'da durmalı: seed dosyasına gömülen bir oran, gözden
    // geçirilebilir tek kaynağı ikiye böler.
    const source = read("seed-launch.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).toContain('load<BusinessConfig>("business-config.json")');
    expect(source).toContain('load<CommissionConfig>("commission.json")');
    expect(source).not.toMatch(
      /\b(?:buyerCommissionRate|sellerCommissionRate|tradeFee\w*)\s*:\s*\d/,
    );
  });

  it("keeps the UAT seed on the shared launch pieces and behind its guard", () => {
    const source = read("seed-uat.ts");
    // Referans veri paylaşılan fonksiyonlardan gelir: kopya yok.
    expect(source).toContain("seedBusinessConfig(prisma, businessConfig)");
    expect(source).toContain("seedCatalog(prisma)");
    expect(source).toContain("seedCommissionRuleSet(prisma, commission)");
    expect(source).toContain('load<BusinessConfig>("business-config.json")');
    // Production'da çalışmayı reddeden guard, herhangi bir yazımdan önce.
    expect(source).toContain("assertUatSeedAllowed(process.env)");
    const main = source.slice(source.indexOf("async function main"));
    expect(main.indexOf("assertUatSeedAllowed(process.env)")).toBeGreaterThan(
      -1,
    );
    expect(main.indexOf("assertUatSeedAllowed(process.env)")).toBeLessThan(
      main.indexOf("seedBusinessConfig("),
    );
    // Şifre kaynakta sabit durmaz.
    expect(source).not.toMatch(/passwordHash:\s*["']/);
  });
});
