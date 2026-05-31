# Sipariş Komisyon/İptal/İade — Faz 2: Buyer Fee Altyapısı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Alıcıdan alınacak %3 platform hizmet bedeli için altyapı — `CommissionRule` seed (`isActive=false`, Faz 5'te aktive edilir) + unit test'ler + spec düzeltmesi. UI değişikliği yok, davranış değişmez.

**Architecture:** Mevcut `calculateCommission()` fonksiyonu zaten `CommissionRule.buyerRate` üzerinden hesaplama yapıyor (yüzde tam sayı: `3` = %3). Order ve checkout akışı `buyerFeeAmount`'u zaten Order.buyerFeeAmount alanına yazıyor. Faz 2 sadece seed kaydını eklemek ve unit test kapsamını genişletmek. Faz 5'te `isActive=true` çekilince ücret otomatik devreye girer.

**Tech Stack:** Prisma 5, PostgreSQL, NestJS, Jest

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` (Bölüm 8)

---

## Dosya Yapısı

**Oluşturulacak:**
- `apps/api/prisma/migrations/<ts>_seed_buyer_fee_commission_rule/migration.sql`
- `apps/api/src/modules/order/order.service.buyer-fee.spec.ts` (calculateCommission buyer fee senaryoları)

**Değiştirilecek:**
- `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` (Bölüm 8.1 — `buyerRate: 0.03` → `buyerRate: 3`)
- `docs/ESCROW_PAYOUT_PLAN.md` (Faz 2 kapanış notu)

---

## Task 1: Spec hatasını düzelt

**Files:**
- Modify: `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md`

- [ ] **Step 1: 8.1 bölümündeki seed örneğini güncelle**

`buyerRate: 0.03` ifadesini `buyerRate: 3` ile değiştir; ek olarak hesaplama formülünü `subtotal * (buyerRate / 100)` olarak göster (mevcut kodu yansıt).

- [ ] **Step 2: 8.2 bölümündeki hesaplama kodunu güncelle**

```typescript
function calculateBuyerFee(productPrice: Decimal): Decimal {
  const rule = findActiveCommissionRule({ appliesTo: 'BUYER' });
  if (!rule || !rule.isActive) return new Decimal(0);

  // buyerRate yuzde tam sayi olarak saklanir (3 = %3)
  let fee = productPrice.mul(rule.buyerRate).div(100);
  if (rule.buyerMin && fee.lt(rule.buyerMin)) fee = rule.buyerMin;
  if (rule.buyerMax && fee.gt(rule.buyerMax)) fee = rule.buyerMax;
  return fee.toDP(2);
}
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md
git commit -m "docs(spec): buyerRate yuzde tam sayi olarak (3 = %3) duzeltildi"
```

---

## Task 2: Seed migration — `CommissionRule` buyer fee kaydı

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_seed_buyer_fee_commission_rule/migration.sql`

- [ ] **Step 1: Migration dizinini yarat**

```bash
cd /Users/gorkemsubas/Desktop/projeler/tarodan/tarodan-app/apps/api
ts=$(date -u +%Y%m%d%H%M%S)
mkdir -p "prisma/migrations/${ts}_seed_buyer_fee_commission_rule"
```

- [ ] **Step 2: Seed SQL yaz**

`migration.sql` içeriği:

```sql
-- Buyer fee CommissionRule kaydı.
-- isActive=false: Faz 5'te super_admin tarafından aktive edilecek.
-- buyerRate=3.0000: yuzde tam sayi (3 = %3). calculateCommission() bu degeri
-- subtotal ile carpip 100'e bolerek fee hesaplar.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO "commission_rules" (
  "id", "name", "rule_type", "applies_to",
  "seller_rate", "buyer_rate",
  "buyer_min", "buyer_max",
  "is_active", "priority",
  "created_at", "updated_at"
)
VALUES (
  'buyer-fee-rule',
  'Platform Hizmet Bedeli (Alıcı)',
  'default',
  'BUYER',
  NULL,
  3.0000,
  NULL,
  NULL,
  false,
  0,
  NOW(),
  NOW()
)
ON CONFLICT ("id") DO NOTHING;
```

- [ ] **Step 3: Migration'ı uygula**

```bash
pnpm prisma migrate deploy
```

Beklenen: `Applied migration ..._seed_buyer_fee_commission_rule`.

- [ ] **Step 4: DB'de doğrula**

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d tarodan -c \
  "SELECT id, applies_to, buyer_rate, is_active FROM commission_rules WHERE id='buyer-fee-rule';"
```

Beklenen: 1 satır, `applies_to='BUYER'`, `buyer_rate=3.0000`, `is_active=false`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations/*_seed_buyer_fee_commission_rule
git commit -m "feat(commission): buyer fee CommissionRule seed (isActive=false, Faz 2.2)"
```

---

## Task 3: Unit test — `calculateCommission` buyer fee senaryoları

**Files:**
- Create: `apps/api/test/e2e/order-buyer-fee.e2e-spec.ts`

Mevcut `calculateCommission` fonksiyonunu test etmek için e2e değil unit test daha uygun olur, ama bu fonksiyon NestJS service içinde ve injection gerektirir. E2E test ile gerçek prisma client + service üzerinden çalıştırmak en pratik.

Ancak Faz 1'de gördük ki tam NestJS bootstrap çok ağır + Docker bağımlılığı var. Bu yüzden test'i hafif yapacağız: yalnızca raw Prisma seed + saf hesaplama fonksiyonu çağrısı.

`calculateCommission` `OrderService` içinde method. Tek başına izole etmek için `OrderService`'i kendi bağımlılıklarıyla manuel instantiate edeceğiz (sadece PrismaService inject).

- [ ] **Step 1: Failing test yaz**

Yeni dosya: `apps/api/test/e2e/order-buyer-fee.e2e-spec.ts`

```typescript
import { Prisma } from '@prisma/client';
import { OrderService } from '../../src/modules/order/order.service';
import { PrismaService } from '../../src/prisma';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../test-utils/db';

/**
 * Faz 2.3 — Buyer fee hesaplama (calculateCommission) testleri.
 * CommissionRule.appliesTo=BUYER ve isActive=true iken %3 fee uygulanir.
 * isActive=false iken buyer fee = 0 (gecis durumu, Faz 5'e kadar).
 */
describe('OrderService.calculateCommission (buyer fee) (E2E)', () => {
  let svc: OrderService;
  let prisma: PrismaService;

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    svc = new OrderService(prisma, /* membershipService */ {} as any, /* eventService */ {} as any);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    await seedBaseline();
  });

  it('aktif buyer fee rule yoksa buyerFeeAmount = 0', async () => {
    // commission_rules tablosu truncate sonrasi bos
    const result = await svc.calculateCommission(1000, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(0);
  });

  it('isActive=false rule varken buyerFeeAmount = 0', async () => {
    await prisma.commissionRule.create({
      data: {
        id: 'buyer-fee-rule',
        name: 'Platform Hizmet Bedeli (Alici)',
        ruleType: 'default' as any,
        appliesTo: 'BUYER' as any,
        buyerRate: new Prisma.Decimal('3.0000'),
        isActive: false,
        priority: 0,
      },
    });
    const result = await svc.calculateCommission(1000, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(0);
  });

  it('isActive=true rule, %3 uygulanir', async () => {
    await prisma.commissionRule.create({
      data: {
        id: 'buyer-fee-rule',
        name: 'Platform Hizmet Bedeli (Alici)',
        ruleType: 'default' as any,
        appliesTo: 'BUYER' as any,
        buyerRate: new Prisma.Decimal('3.0000'),
        isActive: true,
        priority: 0,
      },
    });
    const result = await svc.calculateCommission(1000, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(30); // 1000 * 3 / 100
  });

  it('buyerMin uygulanir', async () => {
    await prisma.commissionRule.create({
      data: {
        id: 'buyer-fee-rule',
        name: 'Platform Hizmet Bedeli (Alici)',
        ruleType: 'default' as any,
        appliesTo: 'BUYER' as any,
        buyerRate: new Prisma.Decimal('3.0000'),
        buyerMin: new Prisma.Decimal('5.00'),
        isActive: true,
        priority: 0,
      },
    });
    const result = await svc.calculateCommission(100, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(5); // 100 * 3 / 100 = 3, min = 5
  });

  it('buyerMax uygulanir', async () => {
    await prisma.commissionRule.create({
      data: {
        id: 'buyer-fee-rule',
        name: 'Platform Hizmet Bedeli (Alici)',
        ruleType: 'default' as any,
        appliesTo: 'BUYER' as any,
        buyerRate: new Prisma.Decimal('3.0000'),
        buyerMax: new Prisma.Decimal('50.00'),
        isActive: true,
        priority: 0,
      },
    });
    const result = await svc.calculateCommission(10000, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(50); // 10000 * 3 / 100 = 300, max = 50
  });

  it('ucretsiz urunde buyerFee = 0', async () => {
    await prisma.commissionRule.create({
      data: {
        id: 'buyer-fee-rule',
        name: 'Platform Hizmet Bedeli (Alici)',
        ruleType: 'default' as any,
        appliesTo: 'BUYER' as any,
        buyerRate: new Prisma.Decimal('3.0000'),
        isActive: true,
        priority: 0,
      },
    });
    const result = await svc.calculateCommission(0, 'fake-seller', 'fake-category');
    expect(result.buyerFeeAmount).toBe(0);
  });
});
```

- [ ] **Step 2: Test'i çalıştır**

```bash
cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand order-buyer-fee --forceExit
```

Beklenen: 6/6 PASS.

**NOT:** `OrderService` constructor başka servisler gerektiriyorsa (örneğin `MembershipService`, `EventService`), test başlangıcında mock olarak `{} as any` geçilmiş — `calculateCommission` bunları çağırmadığı için sorun olmaz. Eğer çağırıyorsa, test minimal mock'larla uyarlanmalı.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/e2e/order-buyer-fee.e2e-spec.ts
git commit -m "test(commission): buyer fee senaryolari (rate/min/max/aktiflik) (Faz 2.3)"
```

---

## Task 4: Faz 2 kapanış notu

**Files:**
- Modify: `docs/ESCROW_PAYOUT_PLAN.md`

- [ ] **Step 1: Mevcut "Faz 1 tamamlandı" notunun altına Faz 2 satırı ekle**

```markdown
> **2026-05-31 — Faz 2 tamamlandı:** Buyer fee altyapısı hazır.
> CommissionRule.id='buyer-fee-rule' kaydı seed edildi (appliesTo='BUYER',
> buyerRate=3.0000, isActive=false). Mevcut calculateCommission()
> fonksiyonu zaten buyerRate uzerinden hesaplama yapiyor; aktivasyon
> Faz 5'te super_admin tarafindan flag flip ile yapilacak. Davranış
> değişmedi.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ESCROW_PAYOUT_PLAN.md
git commit -m "docs: Faz 2 (buyer fee) tamamlama notu"
```

---

## Faz 2 Çıktı Özeti (Definition of Done)

- [x] CommissionRule buyer fee kaydı seed edildi (`isActive=false`)
- [x] `calculateCommission` buyer fee senaryoları için unit/E2E test'ler (6 case) yeşil
- [x] Spec metnindeki `buyerRate` formatı düzeltildi (yüzde tam sayı)
- [x] Mevcut sipariş/checkout davranışı değişmedi
- [x] Build temiz

## Bir Sonraki Faz

**Faz 3 — 48h Pencere + Ledger:** `OrderSchedulerService` + `completeOrder` + `confirmReceipt` endpoint + admin force-complete/extend + cron'lar + feature flag `FEATURE_48H_CONFIRMATION_WINDOW`. En büyük faz; ayrı plan dosyası: `docs/superpowers/plans/2026-05-31-phase3-48h-window-and-ledger.md`.
