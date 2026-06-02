# Sipariş Komisyon/İptal/İade — Faz 5: Aktivasyon + calculateCommission Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Buyer fee'yi (CommissionRule.is_active=true) **canlıya almak** + altyapısı için gereken `calculateCommission` refactor (BUYER + SELLER ayrı lookup, spec Bölüm 14.4) + unit test + kullanıcı duyurusu + toolchain düzeltmesi (Faz 5 testleri için ön koşul).

**Architecture:** Faz 1-4 ile tüm altyapı hazır:
- `CommissionRule.id='buyer-fee-rule'` mevcut (`isActive=false`, `buyerRate=3.0000`)
- `Order.buyerFeeAmount` alanı + checkout entegrasyonu hazır
- Refund akışlarında `refundBuyerFee` policy var
- Web checkout buyer fee satırı conditional render (`> 0` ise görünür)
- /platform-hizmet-bedeli yasal sayfası canlıda

Faz 5 sadece **calculateCommission**'ı doğru hale getirip flag'i kaldıracak.

**Tech Stack:** NestJS, Prisma, Jest, PostgreSQL

**Spec referansı:** `docs/superpowers/specs/2026-05-31-order-commission-cancel-refund-design.md` Bölüm 8 + 14.4

---

## Sub-faz Özeti

| Alt | İçerik | Tahmin |
|---|---|---|
| **5.0** | Toolchain fix (Node 20 LTS + Jest/Nest CLI) — Task 1-3 için zorunlu | 1-2 saat |
| **5.1** | `calculateCommission` refactor — BUYER + SELLER ayrı lookup | 2-3 saat |
| **5.2** | Unit test (refactor sonrası senaryoları) | 1-2 saat |
| **5.3** | Pre-launch smoke test (sandbox checkout — buyer fee=0 hala) | 30 dk |
| **5.4** | Kullanıcı duyurusu (in-app banner + email + admin panel toggle) | 1-2 saat |
| **5.5** | Aktivasyon — CommissionRule.is_active=true flip + canlı smoke | 30 dk |
| **5.6** | Post-launch monitoring + ESCROW kapanış | 30 dk + ongoing |

---

## Faz 5.0 — Toolchain Fix (ZORUNLU PREREQUISITE)

**Sorun:** Node 22 + Jest 29 + Nest CLI + bazı paketlerin lazy-require interop'u sessizce takılıyor. tsc/nest build/jest crash atıyor.

### Task 5.0.1 — Node sürüm belirle ve .nvmrc

- [ ] **Step 1:** `.nvmrc` dosyası oluştur (proje root'unda):

```
20.19.5
```

- [ ] **Step 2:** `package.json` `engines` alanını güncelle:

```json
"engines": {
  "node": ">=20.0.0 <22.0.0",
  "pnpm": ">=8.0.0"
}
```

- [ ] **Step 3:** `apps/api/package.json`, `apps/web/package.json`, `apps/admin/package.json` engines uyumla.

- [ ] **Step 4:** Commit: `chore: pin Node 20 LTS (.nvmrc + engines)`

### Task 5.0.2 — Node 20'ye geç + temiz install

```bash
nvm use 20.19.5  # veya .nvmrc'den otomatik
rm -rf node_modules
rm -f pnpm-lock.yaml  # eğer yeniden çözmek gerekiyorsa
pnpm install
```

- [ ] **Step 1:** Yukarıdaki komutları çalıştır.

- [ ] **Step 2:** `pnpm build` çalışıyor mu kontrol et (en az `cd apps/api && pnpm build`).

- [ ] **Step 3:** `npx jest --version` çıktısı doğru mu (29.7.0).

- [ ] **Step 4:** Commit (lockfile değiştiyse): `chore: lockfile refresh for Node 20`

### Task 5.0.3 — Smoke test: Faz 1'de yazılan backfill testi koşsun

```bash
cd apps/api
pnpm test:e2e commission-ledger-backfill
```

Beklenen: 7/7 PASS (Faz 1.7'deki gibi).

- [ ] **Step 1:** Test'i çalıştır.

- [ ] **Step 2:** PASS ise toolchain hazır. FAIL ise hatayı tek tek ele al (Jest version mismatch, peer dep, vs.).

- [ ] **Step 3:** Commit yok — sadece kontrol.

### Task 5.0.4 — Faz 3A.7-8 testleri çalıştır

```bash
cd apps/api
pnpm test:e2e order-48h-window
```

Beklenen: 9/9 PASS. FAIL ise: muhtemelen mock'larda eksik bağımlılık veya seedBaseline güncellemesi gerekir.

- [ ] **Step 1:** Test çalıştır, hataları topla.

- [ ] **Step 2:** Düzeltmeleri tek commit'te yap: `fix(test): order-48h-window testlerini Node 20 ile çalışır hale getir`

---

## Faz 5.1 — calculateCommission Refactor

**Mevcut sorun (spec Bölüm 14.4):** `findMatchingRule` tek bir kural dönderiyor; `appliesTo` enum'una göre buyerFee veya sellerFee'yi 0'lıyor. BUYER + SELLER kurallarının **aynı anda** uygulanması mümkün değil.

**Çözüm:** İki ayrı lookup → SELLER eşleşmesi + BUYER eşleşmesi → her birinden ilgili fee hesabı → toplam.

### Task 5.1.1 — Yeni `calculateCommission` yazımı

**Files:**
- Modify: `apps/api/src/modules/order/order.service.ts`

- [ ] **Step 1:** Mevcut `calculateCommission` ve `findMatchingRule` metodlarını analiz et. CommissionResult interface'i koru.

- [ ] **Step 2:** Yeni implementasyon:

```typescript
async calculateCommission(
  amount: number,
  sellerId: string,
  categoryId?: string | null,
): Promise<CommissionResult> {
  const seller = await this.prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      sellerType: true,
      membership: { include: { tier: { select: { type: true } } } },
    },
  });

  const commissionSellerType = this.mapSellerTypeForCommission(
    seller?.sellerType ?? null,
    seller?.membership?.tier?.type ?? null,
  );

  const allActive = await this.prisma.commissionRule.findMany({
    where: { isActive: true },
    include: { category: true },
  });

  // 1) SELLER eşleşmesi (appliesTo IN (SELLER, BOTH))
  const sellerRules = allActive.filter(
    (r) =>
      r.appliesTo === CommissionAppliesTo.SELLER ||
      r.appliesTo === CommissionAppliesTo.BOTH,
  );
  const sellerMatch = this.findMatchingRule(sellerRules, categoryId, commissionSellerType);

  // 2) BUYER eşleşmesi (appliesTo IN (BUYER, BOTH))
  const buyerRules = allActive.filter(
    (r) =>
      r.appliesTo === CommissionAppliesTo.BUYER ||
      r.appliesTo === CommissionAppliesTo.BOTH,
  );
  const buyerMatch = this.findMatchingRule(buyerRules, categoryId, commissionSellerType);

  // Seller fee hesaplama
  let sellerFee = 0;
  if (sellerMatch && sellerMatch.sellerRate) {
    const raw = amount * (Number(sellerMatch.sellerRate) / 100);
    sellerFee = this.clampAmount(
      raw,
      sellerMatch.sellerMin ? Number(sellerMatch.sellerMin) : null,
      sellerMatch.sellerMax ? Number(sellerMatch.sellerMax) : null,
    );
  }

  // Buyer fee hesaplama
  let buyerFee = 0;
  if (buyerMatch && buyerMatch.buyerRate) {
    const raw = amount * (Number(buyerMatch.buyerRate) / 100);
    buyerFee = this.clampAmount(
      raw,
      buyerMatch.buyerMin ? Number(buyerMatch.buyerMin) : null,
      buyerMatch.buyerMax ? Number(buyerMatch.buyerMax) : null,
    );
  }

  const totalCommission = sellerFee + buyerFee;

  this.logger.log(
    `Commission: amount=${amount} sellerFee=${sellerFee} (rule=${sellerMatch?.id ?? 'none'}) buyerFee=${buyerFee} (rule=${buyerMatch?.id ?? 'none'})`,
  );

  return {
    buyerFeeAmount: buyerFee,
    sellerFeeAmount: sellerFee,
    commissionAmount: totalCommission,
    ruleId: sellerMatch?.id ?? buyerMatch?.id ?? null,
    ruleName: sellerMatch?.name ?? buyerMatch?.name ?? null,
    ruleType: sellerMatch?.ruleType ?? buyerMatch?.ruleType,
    appliedRate: sellerMatch?.sellerRate
      ? Number(sellerMatch.sellerRate)
      : buyerMatch?.buyerRate
        ? Number(buyerMatch.buyerRate)
        : 0,
  };
}
```

- [ ] **Step 3:** Build doğrula (`pnpm build`).

- [ ] **Step 4:** Commit: `refactor(order): calculateCommission BUYER+SELLER ayrı lookup (Faz 5.1)`

---

## Faz 5.2 — Unit Test

### Task 5.2.1 — calculateCommission test senaryoları

**Files:**
- Create: `apps/api/test/e2e/order-buyer-fee.e2e-spec.ts` (Faz 2'de plan vardı, atlanmıştı)

- [ ] **Step 1:** Test fixture'ları:

```typescript
// Yardımcı: belirli CommissionRule seed et
async function seedRule(prisma: PrismaClient, opts: Partial<CommissionRule>) {
  return prisma.commissionRule.create({ data: { ...defaults, ...opts } });
}

beforeEach(async () => {
  await truncateAll();
  await seedBaseline();
});
```

- [ ] **Step 2:** Senaryolar (7 case):

1. **Rule yok:** `calculateCommission(1000)` → buyer=0, seller=0
2. **Sadece SELLER rule (5%):** → seller=50, buyer=0
3. **Sadece BUYER rule (3%):** → seller=0, buyer=30
4. **Hem SELLER (5%) hem BUYER (3%) ayrı rule:** → seller=50, buyer=30 (toplam 80)
5. **Min uygulanır:** subtotal=100, BUYER rule rate=3, min=5 → buyer=5
6. **Max uygulanır:** subtotal=10000, BUYER rule rate=3, max=50 → buyer=50
7. **isActive=false rule görmezden gelinir:** buyer=0

- [ ] **Step 3:** Test'i çalıştır → 7/7 PASS bekleniyor.

- [ ] **Step 4:** Commit: `test(order): calculateCommission BUYER+SELLER senaryoları (Faz 5.2)`

---

## Faz 5.3 — Pre-launch Smoke Test (Manuel)

### Task 5.3.1 — Sandbox checkout (buyer fee henüz 0)

- [ ] **Step 1:** Local dev DB'de:

```bash
psql "$DATABASE_URL" -c "SELECT id, applies_to, buyer_rate, is_active FROM commission_rules;"
```

`buyer-fee-rule` is_active=false olmalı.

- [ ] **Step 2:** Web'de bir ürün sepete ekle → checkout sayfasında **"Platform Hizmet Bedeli" satırı görünmez** (conditional render).

- [ ] **Step 3:** Mobile'da aynı kontrol.

- [ ] **Step 4:** Admin panelinde checkout quote endpoint'inden buyer_fee=0 dönüyor mu kontrol et.

- [ ] **Step 5:** Commit yok — sadece kontrol notu.

---

## Faz 5.4 — Kullanıcı Duyurusu

Kullanıcıların Platform Hizmet Bedeli aktivasyonundan haberdar olması yasal/etik zorunluluk.

### Task 5.4.1 — In-app banner (web + mobile)

**Files:**
- Create: `apps/web/src/components/banners/PlatformFeeAnnouncementBanner.tsx`
- Create: `apps/mobile/src/components/PlatformFeeAnnouncementBanner.tsx`

- [ ] **Step 1:** Web banner: ilk açılışta + sepet sayfasında 7 gün boyunca göster (localStorage flag). Link → /platform-hizmet-bedeli.

- [ ] **Step 2:** Mobile banner: AsyncStorage flag. Drawer'ın üstünde ilk açılışta gösterilir.

- [ ] **Step 3:** TR + EN içerik:

> 2 Haziran 2026 itibarıyla TARODAN'da yapılan satın almalardan ürün bedelinin %3'ü oranında Platform Hizmet Bedeli alınmaya başlanmıştır. Detaylı bilgi için tıklayın.

- [ ] **Step 4:** Commit: `feat(web,mobile): Platform Hizmet Bedeli duyuru banner'ı`

### Task 5.4.2 — Email duyurusu (manuel)

- [ ] **Step 1:** Pazarlama ekibi email taslağı hazırlasın. (Bu plan kapsamı dışında — sadece checklist.)

- [ ] **Step 2:** Email gönderim zamanlaması: flag flip'ten 1 hafta önce.

- [ ] **Step 3:** Commit yok.

---

## Faz 5.5 — Aktivasyon (CANLI)

### Task 5.5.1 — Migration: is_active=true flip

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_activate_buyer_fee_rule/migration.sql`

- [ ] **Step 1:** Migration:

```sql
UPDATE "commission_rules"
SET "is_active" = true, "updated_at" = NOW()
WHERE "id" = 'buyer-fee-rule';
```

- [ ] **Step 2:** Local dev DB'de uygula → checkout sayfasında satır görünmeli (refactor sonrası).

- [ ] **Step 3:** Smoke test: yeni bir test order ile checkout → buyer_fee=ürün*0.03.

- [ ] **Step 4:** Commit: `feat(commission): buyer fee activated — is_active=true (Faz 5.5)`

### Task 5.5.2 — Production deploy + canlı smoke

- [ ] **Step 1:** Migration prod'a deploy.

- [ ] **Step 2:** İlk gerçek müşteri sipariş smoke (admin panel'den izle).

- [ ] **Step 3:** Banner aktivasyon kontrolü.

- [ ] **Step 4:** Commit yok — sadece deploy notu.

---

## Faz 5.6 — Post-launch + ESCROW Kapanış

### Task 5.6.1 — Monitoring (ilk 7 gün)

- [ ] **Step 1:** Admin panelinde "CommissionLedger" listesi: `earned` status'ündeki kayıtlarda `buyer_fee` doluyor mu.

- [ ] **Step 2:** Hata raporlama (Sentry / log): "BUYER rule not matched" log'ları gözlem.

- [ ] **Step 3:** Müşteri destek kayıtları: "Bu nedir?" sorularına hazır cevap.

### Task 5.6.2 — ESCROW kapanış notu

```markdown
> **<date> — Faz 5 tamamlandı (AKTİVASYON):**
> calculateCommission BUYER + SELLER ayrı lookup refactor (spec 14.4).
> 7 senaryolu unit test 7/7 yeşil. Banner duyurusu web + mobile.
> CommissionRule.id='buyer-fee-rule' is_active=true. İlk X siparişte
> buyer fee doğru hesaplandı. Sipariş Komisyon/İptal/İade projesi tamamlandı.
```

- [ ] **Step 1:** ESCROW_PAYOUT_PLAN.md'e ekle.

- [ ] **Step 2:** Commit: `docs: Faz 5 + sipariş komisyon/iade projesi kapanış`

---

## Faz 5 Çıktı Özeti (Definition of Done)

- [x] Toolchain çalışıyor (Node 20, Jest, Nest build temiz)
- [x] calculateCommission BUYER + SELLER ayrı lookup
- [x] 7 senaryolu unit test yeşil
- [x] Sandbox smoke yeşil (buyer fee=0 → conditional)
- [x] Banner web + mobile canlıda
- [x] Migration is_active=true uygulandı
- [x] Production'da ilk sipariş buyer fee doğru hesaplandı
- [x] CommissionLedger.buyerFee doluyor
- [x] Müşteri destek hazır

## Proje Kapanışı

Faz 5 sonrası **Sipariş Komisyon/İptal/İade** projesi tamamen tamamlanır. Spec'in başlık 1-7'sinde belirtilen tüm gereksinimler karşılanır:

1. ✅ Komisyon yalnızca başarılı tamamlanan işlemlerden alınır (CommissionLedger)
2. ✅ Sipariş akışı (`paid → preparing → shipped → delivered → awaiting_buyer_confirmation → completed`)
3. ✅ 48 saat kontrol süreci (manuel onay + auto timeout cron)
4. ✅ Dispute / sorun bildirme (6 reason + counterfeit + lost_in_transit)
5. ✅ Komisyon iadesi kuralları (markEarned/markRefunded/markWaived)
6. ✅ 4 senaryo (A/B/C/D)
7. ✅ Kargo + PayTR %3 fee'si alıcıdan %3 platform hizmet bedeli ile telafi
