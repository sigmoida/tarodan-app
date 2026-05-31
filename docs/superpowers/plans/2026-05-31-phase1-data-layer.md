# Sipariş Komisyon/İptal/İade — Faz 1: Veri Katmanı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prisma schema değişiklikleri (CommissionLedger modeli, Order alanları, enum genişlemeleri, RefundRequest policy alanları) + migration'lar + mevcut sipariş backfill — davranış değişmez, sadece veri katmanı hazırlanır.

**Architecture:** Spec'in [Bölüm 5](../specs/2026-05-31-order-commission-cancel-refund-design.md#5-veri-modeli-değişiklikleri) ve [Bölüm 12.1-12.2](../specs/2026-05-31-order-commission-cancel-refund-design.md#121-migration-sırası)'sini uygular. PostgreSQL enum `ADD VALUE` transaction-safe değil → her enum genişlemesi ayrı migration. Mevcut sipariş verisi `commission_ledger` tablosuna backfill ile taşınır. Bu fazın sonunda hiçbir API endpoint davranışı değişmez; yalnızca yeni alanlar boş/default değer alır.

**Tech Stack:** Prisma 5+, PostgreSQL, NestJS, Jest, pnpm workspace, Decimal.js

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md`

---

## Dosya Yapısı

**Oluşturulacak:**
- `apps/api/prisma/migrations/20260531120000_add_commission_ledger/migration.sql`
- `apps/api/prisma/migrations/20260531120001_add_order_buyer_confirmation/migration.sql`
- `apps/api/prisma/migrations/20260531120002_add_awaiting_buyer_confirmation_status/migration.sql`
- `apps/api/prisma/migrations/20260531120003_add_refund_reason_values/migration.sql`
- `apps/api/prisma/migrations/20260531120004_add_refund_policy_fields/migration.sql`
- `apps/api/prisma/migrations/20260531120005_backfill_commission_ledger/migration.sql`
- `apps/api/src/modules/commission/commission-ledger.types.ts` (yeniden export edilen Prisma tipleri için sığ wrapper)

**Değiştirilecek:**
- `apps/api/prisma/schema.prisma` (CommissionLedger model, enum'lar, Order alanları, RefundRequest alanları, User relation, OrderStatus genişleme)

**Hiç oluşturulmayacak (Faz 1 kapsamı dışı):** servisler, controller'lar, cron'lar, UI değişiklikleri. Faz 1 SADECE veri katmanıdır.

---

## Task 1: CommissionLedger modeli + CommissionLedgerStatus enum (schema)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma'ya CommissionLedger modeli ve enum ekle**

`apps/api/prisma/schema.prisma` dosyasının sonuna (diğer enum'lardan önce, model bloğu kısmının sonuna) ekle:

```prisma
model CommissionLedger {
  id                   String                 @id @default(uuid())
  orderId              String                 @unique @map("order_id")
  order                Order                  @relation(fields: [orderId], references: [id])

  sellerCommission     Decimal                @map("seller_commission") @db.Decimal(10, 2)
  buyerFee             Decimal                @map("buyer_fee") @db.Decimal(10, 2)
  totalPlatformRevenue Decimal                @map("total_platform_revenue") @db.Decimal(10, 2)

  status               CommissionLedgerStatus @default(pending)
  earnedAt             DateTime?              @map("earned_at")
  refundedAt           DateTime?              @map("refunded_at")
  waivedAt             DateTime?              @map("waived_at")
  waivedReason         String?                @map("waived_reason")

  createdAt            DateTime               @default(now()) @map("created_at")
  updatedAt            DateTime               @updatedAt @map("updated_at")

  @@index([status])
  @@index([earnedAt])
  @@map("commission_ledger")
}
```

Enum bloğunun bulunduğu yere (dosyanın sonuna yakın) ekle:

```prisma
enum CommissionLedgerStatus {
  pending
  earned
  refunded
  waived
}
```

- [ ] **Step 2: Order modeline `commissionLedger` relation ekle**

`apps/api/prisma/schema.prisma` içindeki `model Order` bloğunun içine, mevcut `refundRequests` satırının altına ekle:

```prisma
  commissionLedger       CommissionLedger?
```

- [ ] **Step 3: Migration üret**

```bash
cd apps/api
pnpm prisma migrate dev --name add_commission_ledger --create-only
```

Beklenen: `prisma/migrations/<timestamp>_add_commission_ledger/migration.sql` dosyası yaratılır.

- [ ] **Step 4: Migration dosyasını oku ve doğrula**

```bash
cat apps/api/prisma/migrations/*_add_commission_ledger/migration.sql
```

Beklenen içerik:
```sql
CREATE TYPE "CommissionLedgerStatus" AS ENUM ('pending', 'earned', 'refunded', 'waived');

CREATE TABLE "commission_ledger" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seller_commission" DECIMAL(10,2) NOT NULL,
    "buyer_fee" DECIMAL(10,2) NOT NULL,
    "total_platform_revenue" DECIMAL(10,2) NOT NULL,
    "status" "CommissionLedgerStatus" NOT NULL DEFAULT 'pending',
    "earned_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "waived_at" TIMESTAMP(3),
    "waived_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "commission_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commission_ledger_order_id_key" ON "commission_ledger"("order_id");
CREATE INDEX "commission_ledger_status_idx" ON "commission_ledger"("status");
CREATE INDEX "commission_ledger_earned_at_idx" ON "commission_ledger"("earned_at");

ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

Beklenen: `Applied migration` mesajı + error yok.

- [ ] **Step 6: Prisma client gen**

```bash
cd apps/api
pnpm prisma generate
```

Beklenen: `Generated Prisma Client`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(commission): CommissionLedger modeli + enum (Faz 1.1)"
```

---

## Task 2: Order modeline buyer confirmation alanları + BuyerConfirmationType enum

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma — Order modeline yeni alanlar ekle**

`apps/api/prisma/schema.prisma` içindeki `model Order` bloğuna, `paymentExpiresAt` alanının altına ekle:

```prisma
  deliveredAt            DateTime?               @map("delivered_at")
  confirmationDeadline   DateTime?               @map("confirmation_deadline")
  buyerConfirmedAt       DateTime?               @map("buyer_confirmed_at")
  buyerConfirmationType  BuyerConfirmationType?  @map("buyer_confirmation_type")
  completedAt            DateTime?               @map("completed_at")
```

- [ ] **Step 2: BuyerConfirmationType enum'unu ekle**

Enum bloğuna ekle:

```prisma
enum BuyerConfirmationType {
  manual_ok
  auto_timeout
  admin_force
}
```

- [ ] **Step 3: Migration üret**

```bash
cd apps/api
pnpm prisma migrate dev --name add_order_buyer_confirmation --create-only
```

- [ ] **Step 4: Migration'ı doğrula**

```bash
cat apps/api/prisma/migrations/*_add_order_buyer_confirmation/migration.sql
```

Beklenen içerik (özet):
```sql
CREATE TYPE "BuyerConfirmationType" AS ENUM ('manual_ok', 'auto_timeout', 'admin_force');

ALTER TABLE "orders"
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "confirmation_deadline" TIMESTAMP(3),
  ADD COLUMN "buyer_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "buyer_confirmation_type" "BuyerConfirmationType",
  ADD COLUMN "completed_at" TIMESTAMP(3);
```

- [ ] **Step 5: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

- [ ] **Step 6: Prisma client gen**

```bash
cd apps/api
pnpm prisma generate
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(order): buyer confirmation alanları + enum (Faz 1.2)"
```

---

## Task 3: OrderStatus enum'una `awaiting_buyer_confirmation` ekle

**Neden ayrı migration:** PostgreSQL `ALTER TYPE ... ADD VALUE` ifadesi transaction içinde çalıştırılamaz. Prisma migration motoru her migration'ı transaction içinde çalıştırdığı için bunu ayrı bir migration olarak tutmamız gerekir.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma — OrderStatus enum'una yeni değer ekle**

`apps/api/prisma/schema.prisma` içindeki `enum OrderStatus` bloğunu güncelle:

```prisma
enum OrderStatus {
  pending_payment
  paid
  preparing
  shipped
  delivered
  awaiting_buyer_confirmation
  completed
  cancelled
  refund_requested
  refunded
}
```

- [ ] **Step 2: Migration üret**

```bash
cd apps/api
pnpm prisma migrate dev --name add_awaiting_buyer_confirmation_status --create-only
```

- [ ] **Step 3: Migration'ı doğrula**

```bash
cat apps/api/prisma/migrations/*_add_awaiting_buyer_confirmation_status/migration.sql
```

Beklenen:
```sql
ALTER TYPE "OrderStatus" ADD VALUE 'awaiting_buyer_confirmation';
```

- [ ] **Step 4: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

- [ ] **Step 5: Prisma client gen**

```bash
cd apps/api
pnpm prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(order): awaiting_buyer_confirmation status enum (Faz 1.3)"
```

---

## Task 4: RefundReason enum'una `counterfeit` ve `lost_in_transit` ekle

**Neden ayrı migration:** Task 3 ile aynı sebep — `ALTER TYPE ADD VALUE` transaction'a giremez.

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma — RefundReason enum'unu güncelle**

`apps/api/prisma/schema.prisma` içindeki `enum RefundReason` bloğunu güncelle:

```prisma
enum RefundReason {
  changed_mind
  damaged
  wrong_item
  not_as_described
  missing_parts
  counterfeit
  lost_in_transit
  other
}
```

- [ ] **Step 2: Migration üret**

```bash
cd apps/api
pnpm prisma migrate dev --name add_refund_reason_values --create-only
```

- [ ] **Step 3: Migration'ı doğrula**

```bash
cat apps/api/prisma/migrations/*_add_refund_reason_values/migration.sql
```

Beklenen:
```sql
ALTER TYPE "RefundReason" ADD VALUE 'counterfeit';
ALTER TYPE "RefundReason" ADD VALUE 'lost_in_transit';
```

- [ ] **Step 4: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

- [ ] **Step 5: Prisma client gen**

```bash
cd apps/api
pnpm prisma generate
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(refund): counterfeit + lost_in_transit reason değerleri (Faz 1.4)"
```

---

## Task 5: RefundRequest policy alanları + ReturnShippingPayer enum

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: ReturnShippingPayer enum'u ekle**

`apps/api/prisma/schema.prisma` içine enum bloğu ekle:

```prisma
enum ReturnShippingPayer {
  buyer
  seller
  platform
}
```

- [ ] **Step 2: RefundRequest modeline policy alanları ekle**

`model RefundRequest` bloğu içinde `metadata Json?` satırının üstüne ekle:

```prisma
  refundProductAmount    Boolean              @default(true)  @map("refund_product_amount")
  refundShippingFee      Boolean              @default(true)  @map("refund_shipping_fee")
  refundBuyerFee         Boolean              @default(true)  @map("refund_buyer_fee")
  refundSellerCommission Boolean              @default(true)  @map("refund_seller_commission")
  returnShippingPayer    ReturnShippingPayer?                 @map("return_shipping_payer")
  buyerInitiatedAmicable Boolean              @default(false) @map("buyer_initiated_amicable")
```

- [ ] **Step 3: Migration üret**

```bash
cd apps/api
pnpm prisma migrate dev --name add_refund_policy_fields --create-only
```

- [ ] **Step 4: Migration'ı doğrula**

```bash
cat apps/api/prisma/migrations/*_add_refund_policy_fields/migration.sql
```

Beklenen:
```sql
CREATE TYPE "ReturnShippingPayer" AS ENUM ('buyer', 'seller', 'platform');

ALTER TABLE "refund_requests"
  ADD COLUMN "refund_product_amount" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "refund_shipping_fee" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "refund_buyer_fee" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "refund_seller_commission" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "return_shipping_payer" "ReturnShippingPayer",
  ADD COLUMN "buyer_initiated_amicable" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 5: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

- [ ] **Step 6: Prisma client gen**

```bash
cd apps/api
pnpm prisma generate
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(refund): policy alanları + ReturnShippingPayer enum (Faz 1.5)"
```

---

## Task 6: Mevcut sipariş verisi için CommissionLedger backfill testi yaz (TDD)

**Files:**
- Create: `apps/api/test/integration/commission-ledger-backfill.spec.ts`

- [ ] **Step 1: Failing test yaz**

Yeni dosya: `apps/api/test/integration/commission-ledger-backfill.spec.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as path from 'path';

const prisma = new PrismaClient();

describe('CommissionLedger backfill SQL', () => {
  beforeEach(async () => {
    // Test izolasyonu: commission_ledger temizle, fixture order'lar yarat
    await prisma.commissionLedger.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('completed sipariş için earned ledger satırı yaratır', async () => {
    const order = await createFixtureOrder({
      status: 'completed',
      commissionAmount: '50.00',
      buyerFeeAmount: '15.00',
    });

    await runBackfillSql();

    const ledger = await prisma.commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.status).toBe('earned');
    expect(ledger!.sellerCommission.toString()).toBe('50');
    expect(ledger!.buyerFee.toString()).toBe('15');
    expect(ledger!.totalPlatformRevenue.toString()).toBe('65');
    expect(ledger!.earnedAt).not.toBeNull();
  });

  it('paid sipariş için pending ledger satırı yaratır', async () => {
    const order = await createFixtureOrder({
      status: 'paid',
      commissionAmount: '30.00',
      buyerFeeAmount: '9.00',
    });

    await runBackfillSql();

    const ledger = await prisma.commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe('pending');
    expect(ledger!.earnedAt).toBeNull();
  });

  it('cancelled sipariş için waived ledger satırı yaratır', async () => {
    const order = await createFixtureOrder({
      status: 'cancelled',
      commissionAmount: '20.00',
      buyerFeeAmount: '6.00',
    });

    await runBackfillSql();

    const ledger = await prisma.commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe('waived');
    expect(ledger!.waivedAt).not.toBeNull();
  });

  it('refunded sipariş için refunded ledger satırı yaratır', async () => {
    const order = await createFixtureOrder({
      status: 'refunded',
      commissionAmount: '40.00',
      buyerFeeAmount: '12.00',
    });

    await runBackfillSql();

    const ledger = await prisma.commissionLedger.findUnique({
      where: { orderId: order.id },
    });
    expect(ledger!.status).toBe('refunded');
    expect(ledger!.refundedAt).not.toBeNull();
  });

  it('idempotent: tekrar çalıştırıldığında duplicate yaratmaz', async () => {
    await createFixtureOrder({
      status: 'completed',
      commissionAmount: '10.00',
      buyerFeeAmount: '3.00',
    });
    await runBackfillSql();
    await runBackfillSql();

    const count = await prisma.commissionLedger.count();
    expect(count).toBe(1);
  });
});

async function createFixtureOrder(overrides: {
  status: any;
  commissionAmount: string;
  buyerFeeAmount: string;
}) {
  // Minimal buyer + seller + product + order
  const buyer = await prisma.user.create({
    data: {
      email: `buyer-${Date.now()}-${Math.random()}@test.com`,
      passwordHash: 'x',
      firstName: 'B',
      lastName: 'B',
    },
  });
  const seller = await prisma.user.create({
    data: {
      email: `seller-${Date.now()}-${Math.random()}@test.com`,
      passwordHash: 'x',
      firstName: 'S',
      lastName: 'S',
    },
  });
  const product = await prisma.product.create({
    data: {
      title: 'Fixture',
      description: 'x',
      price: '100',
      stock: 1,
      sellerId: seller.id,
      categoryId: (await prisma.category.findFirst())!.id,
    },
  });
  return prisma.order.create({
    data: {
      orderNumber: `BACKFILL-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      buyerId: buyer.id,
      sellerId: seller.id,
      productId: product.id,
      totalAmount: '100',
      commissionAmount: overrides.commissionAmount,
      buyerFeeAmount: overrides.buyerFeeAmount,
      paymentExpiresAt: new Date(Date.now() + 3600_000),
      status: overrides.status,
    },
  });
}

async function runBackfillSql() {
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/20260531120005_backfill_commission_ledger/migration.sql',
  );
  execSync(`psql "$DATABASE_URL" -f "${migrationPath}"`, { stdio: 'pipe' });
}
```

- [ ] **Step 2: Test'i çalıştır → FAIL beklenir**

```bash
cd apps/api
pnpm jest test/integration/commission-ledger-backfill.spec.ts -t "backfill SQL"
```

Beklenen: HEPSİ FAIL — backfill migration dosyası henüz yok (`ENOENT: 20260531120005_backfill_commission_ledger/migration.sql`).

---

## Task 7: Backfill migration SQL'ini yaz (Task 6 testlerini geçirmek için)

**Files:**
- Create: `apps/api/prisma/migrations/20260531120005_backfill_commission_ledger/migration.sql`

- [ ] **Step 1: Backfill SQL'i yaz**

Yeni dosya: `apps/api/prisma/migrations/20260531120005_backfill_commission_ledger/migration.sql`

```sql
-- Idempotent backfill: ON CONFLICT DO NOTHING

-- completed sipariler -> earned
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "earned_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'earned',
  o."updated_at",
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'completed'
ON CONFLICT ("order_id") DO NOTHING;

-- paid / preparing / shipped / delivered -> pending
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'pending',
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" IN ('paid', 'preparing', 'shipped', 'delivered')
ON CONFLICT ("order_id") DO NOTHING;

-- cancelled -> waived
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "waived_at", "waived_reason", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'waived',
  o."updated_at",
  'backfill_cancelled',
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'cancelled'
ON CONFLICT ("order_id") DO NOTHING;

-- refunded -> refunded
INSERT INTO "commission_ledger" (
  "id", "order_id", "seller_commission", "buyer_fee", "total_platform_revenue",
  "status", "refunded_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  o."commission_amount",
  o."buyer_fee_amount",
  (o."commission_amount" + o."buyer_fee_amount"),
  'refunded',
  o."updated_at",
  NOW(),
  NOW()
FROM "orders" o
WHERE o."status" = 'refunded'
ON CONFLICT ("order_id") DO NOTHING;
```

- [ ] **Step 2: Prisma migration klasörüne `migration_lock.toml` etkilenmesini engelle**

Bu migration sadece SQL içeriyor. Prisma migrate `pnpm prisma migrate deploy` ile bu dosyayı otomatik bulup uygular. Schema değişikliği yok.

- [ ] **Step 3: Migration'ı uygula**

```bash
cd apps/api
pnpm prisma migrate deploy
```

Beklenen: `Applied migration 20260531120005_backfill_commission_ledger`.

- [ ] **Step 4: Task 6 testlerini tekrar çalıştır → PASS beklenir**

```bash
cd apps/api
pnpm jest test/integration/commission-ledger-backfill.spec.ts
```

Beklenen: 5/5 PASS (completed, paid, cancelled, refunded, idempotent).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations/20260531120005_backfill_commission_ledger/ apps/api/test/integration/commission-ledger-backfill.spec.ts
git commit -m "feat(commission): backfill migration + integration test (Faz 1.6)"
```

---

## Task 8: Prisma şemasının son durumunu sağlık kontrolü ile doğrula

**Files:** (sadece kontrol — yeni dosya yok)

- [ ] **Step 1: `prisma validate` çalıştır**

```bash
cd apps/api
pnpm prisma validate
```

Beklenen: `The schema at prisma/schema.prisma is valid 🚀`.

- [ ] **Step 2: `prisma migrate status` ile geride kalan migration var mı kontrol et**

```bash
cd apps/api
pnpm prisma migrate status
```

Beklenen çıktı içinde: `Database schema is up to date!` ve son uygulanan migration: `20260531120005_backfill_commission_ledger`.

- [ ] **Step 3: API build et — kırılma var mı**

```bash
cd apps/api
pnpm build
```

Beklenen: 0 TS hatası. Eğer mevcut `payment.service.ts`, `refund.service.ts` gibi dosyalarda yeni alanlar kullanılmadığı için TS sıkıntı çıkarmamalı (alanlar opsiyonel + default değerli).

- [ ] **Step 4: Mevcut testleri çalıştır — regression kontrolü**

```bash
cd apps/api
pnpm test
```

Beklenen: Tüm mevcut testler eskisi gibi geçer. Yeni alanlar opsiyonel/default olduğu için var olan order/refund testleri kırılmaz.

- [ ] **Step 5: Manuel SQL kontrol (dev DB)**

```bash
psql "$DATABASE_URL" -c "\d commission_ledger"
```

Beklenen: tablo, indeksler ve FK göründü.

```bash
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM commission_ledger GROUP BY status;"
```

Beklenen: mevcut sipariş sayısına göre status dağılımı.

```bash
psql "$DATABASE_URL" -c "\d+ orders" | grep -E "delivered_at|confirmation_deadline|buyer_confirmed_at|buyer_confirmation_type|completed_at"
```

Beklenen: 5 satır yeni alan.

```bash
psql "$DATABASE_URL" -c "\d+ refund_requests" | grep -E "refund_product_amount|refund_shipping_fee|refund_buyer_fee|refund_seller_commission|return_shipping_payer|buyer_initiated_amicable"
```

Beklenen: 6 satır yeni alan.

- [ ] **Step 6: Commit yok — sadece kontrol**

Bu task'ta dosya değişikliği yok. Sadece doğrulama.

---

## Task 9: Faz 1 kapatma — runbook notu

**Files:**
- Modify: `docs/ESCROW_PAYOUT_PLAN.md` (eğer mevcut)

- [ ] **Step 1: ESCROW_PAYOUT_PLAN.md başına bir not ekle**

`docs/ESCROW_PAYOUT_PLAN.md` dosyasının en başına (varsa) ekle. Yoksa bu adımı atla:

```markdown
> **2026-05-31 — Faz 1 tamamlandı:** CommissionLedger modeli + Order buyer confirmation alanları + RefundRequest policy alanları + enum genişlemeleri + backfill. Detaylar: `docs/superpowers/plans/2026-05-31-phase1-data-layer.md`. Davranış değişmedi; sonraki faz: buyer fee hesaplama altyapısı.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ESCROW_PAYOUT_PLAN.md
git commit -m "docs: Faz 1 tamamlama notu"
```

---

## Faz 1 Çıktı Özeti (Definition of Done)

- [x] 5 yeni Prisma model/enum/alan migration'ı uygulandı
- [x] CommissionLedger tablosu mevcut siparişler için backfill edildi (completed/pending/waived/refunded ayrımı doğru)
- [x] Idempotent backfill (ON CONFLICT) — tekrar çalıştırılabilir
- [x] Mevcut API davranışı değişmedi (regression test'leri yeşil)
- [x] `pnpm prisma validate` ve `pnpm build` temiz
- [x] Bir sonraki faz (buyer fee altyapı) için altyapı hazır

## Bir Sonraki Faz

**Faz 2 — Buyer Fee Altyapı:** `calculateBuyerFee` fonksiyonu, checkout hesaplama entegrasyonu, CommissionRule seed (rate=0.03, `isActive=false` ilk başta). UI gösterimi yok, sadece backend hesaplama hazırlanır. Plan: `docs/superpowers/plans/2026-05-31-phase2-buyer-fee-infra.md` (henüz yazılmadı — Faz 1 tamamlanınca yazılacak).
