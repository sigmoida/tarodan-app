# Tek iFrame Ödeme Akışı + PaymentMethod Kaldırma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ödeme akışını tek bir PayTR barındırılan (iFrame) akışına indirgemek; kendi kart formumuzu (Direct API) ve `PaymentMethod`/`saveCard` (kayıtlı kart) özelliğini web+api+mobil her yerden kaldırmak.

**Architecture:** Direct API kart endpoint'i ve frontend kart formları kaldırılır; ödeme sayfası sadece PayTR iFrame/redirect gösterir. `PaymentMethod` Prisma modeli, ilgili endpoint/servis/UI ve `saveCard` parametresi tüm uygulamalardan silinir. Ödeme tamamlama state machine'ine (idempotent CAS + auto-refund) **dokunulmaz**; sadece kullanılmayan Direct API yolu devreden çıkar. Geri dönüş (resume) netliği için `payment/[id]` sayfası süresi dolmuş token'da aynı siparişe yeni iFrame token alır.

**Tech Stack:** NestJS (apps/api), Prisma/PostgreSQL, Next.js (apps/web), React Native/Expo (apps/mobile), Jest.

**Kapsam dışı (ayrı, sonraki işler):** "Satın alınmış gözüküyor" ince yarış bug'ının reproduce-first kök-neden düzeltmesi (systematic-debugging ile); PayTR Direct API + token'lı kayıtlı kart (Faz 2).

**Ön koşul — referans satır numaraları:** Aşağıdaki satır numaraları planın yazıldığı andaki (commit 9181151c sonrası) duruma göredir. Bir dosyayı düzenlemeden önce **mutlaka oku**; satırlar kaymış olabilir, sembolik isimlerle (fonksiyon/JSX bloğu) eşle.

---

## Dosya Haritası

**apps/api:**
- `prisma/schema.prisma` — `PaymentMethod` modeli (83-98), `User.paymentMethods` relation (56), `UserMembership.paymentMethodId` (261)
- `src/modules/payment/payment.controller.ts` — `process-direct` (159-171), `methods` endpoint'leri (195-259)
- `src/modules/payment/payment.service.ts` — `getPaymentMethods/addPaymentMethod/deletePaymentMethod/setDefaultPaymentMethod` (3725-3871), `saveCard` mantığı (373-385), `processDirectPayment`/`createDirectPayment` çağrıları
- `src/modules/payment/dto/direct-payment.dto.ts` — `saveCard` alanı (72)
- `src/modules/payment-providers/paytr.service.ts` — `createDirectPayment` (538-696)

**apps/web:**
- `src/app/payment/[id]/page.tsx` — kart formu/toggle/handleDirectPay
- `src/app/payment-methods/page.tsx` — kayıtlı kart sayfası (silinecek)
- `src/app/membership/checkout/page.tsx` + `membership/manage/page.tsx` — saveCard/kart seçimi
- `src/lib/api.ts` — `paymentsApi` kart metodları (399-452), `processDirect` (410-422)

**apps/mobile:**
- `app/settings/payment-methods.tsx` (silinecek)
- `app/checkout/index.tsx` — saveCard (170, 561)
- `app/membership/checkout.tsx` — saveCard (89, 152, 334-342)
- `src/services/api.ts` — kart metodları (656)

---

## FAZ A — Backend: Direct API'yi devre dışı bırak, PaymentMethod'u kaldır

### Task A1: `process-direct` endpoint'ini devre dışı bırak (410 Gone)

**Files:**
- Test: `apps/api/src/modules/payment/payment-direct-disabled.spec.ts` (Create)
- Modify: `apps/api/src/modules/payment/payment.controller.ts:159-171`

- [ ] **Step 1: Failing test yaz**

Create `apps/api/src/modules/payment/payment-direct-disabled.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { GoneException } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

describe('PaymentController process-direct disabled (Faz 1)', () => {
  let controller: PaymentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: {} }],
    }).compile();
    controller = module.get(PaymentController);
  });

  it('process-direct artık desteklenmiyor → GoneException', async () => {
    await expect(
      (controller as any).processDirect({}, { user: { id: 'u1' } }),
    ).rejects.toBeInstanceOf(GoneException);
  });
});
```

- [ ] **Step 2: Testi çalıştır, FAIL gör**

Run: `cd apps/api && npm run test -- payment-direct-disabled.spec.ts`
Expected: FAIL (process-direct hâlâ servise gidiyor / GoneException atmıyor).

- [ ] **Step 3: `processDirect` handler'ını 410 atacak şekilde değiştir**

`payment.controller.ts` içinde `process-direct` handler gövdesini değiştir (mevcut servise yönlendiren gövdeyi kaldır):

```typescript
  @Post('process-direct')
  @ApiOperation({ summary: 'KULLANIM DIŞI — Direct API kart ödemesi (Faz 1 itibarıyla kapalı)' })
  processDirect(@Body() _dto: unknown, @Req() _req: unknown): never {
    throw new GoneException(
      'Kart ile doğrudan ödeme kaldırıldı. Lütfen güvenli ödeme sayfasını kullanın.',
    );
  }
```

`GoneException`'ı NestJS import'una ekle:
```typescript
import { GoneException } from '@nestjs/common';
```

- [ ] **Step 4: Testi çalıştır, PASS gör**

Run: `cd apps/api && npm run test -- payment-direct-disabled.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payment/payment.controller.ts apps/api/src/modules/payment/payment-direct-disabled.spec.ts
git commit -m "feat(payment): Direct API process-direct endpoint'ini devre dışı bırak (410)"
```

---

### Task A2: `saveCard` mantığını ve PaymentMethod servis metotlarını kaldır

**Files:**
- Modify: `apps/api/src/modules/payment/payment.service.ts` (saveCard 373-385, PaymentMethod metotları 3725-3871)
- Modify: `apps/api/src/modules/payment/dto/direct-payment.dto.ts:72` (saveCard alanı)

- [ ] **Step 1: `payment.service.ts`'i oku, `saveCard` bloğunu bul ve kaldır**

373-385 civarındaki `if (dto.saveCard) { await this.addPaymentMethod(...) }` bloğunu tamamen sil. (Bu blok artık `process-direct` kapalı olduğu için zaten erişilemez; ölü kod.)

- [ ] **Step 2: PaymentMethod servis metotlarını sil**

`getPaymentMethods` (3725-3742), `addPaymentMethod` (3748-3810), `deletePaymentMethod` (3815-3844), `setDefaultPaymentMethod` (3849-3871) metotlarının tamamını sil.

- [ ] **Step 3: `direct-payment.dto.ts`'ten `saveCard` alanını sil**

72. satırdaki `saveCard?: boolean;` alanını ve varsa `@ApiProperty`/decorator'ını sil.

- [ ] **Step 4: API derlemesini doğrula (kalan referanslar TS hatası verecek)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PaymentMethod metotlarına/saveCard'a kalan referans varsa TS hatası listelenir. Sıradaki adımda controller'ı temizleyince çözülür. Bu noktada hata olması beklenir (henüz controller endpoint'leri var).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/payment/payment.service.ts apps/api/src/modules/payment/dto/direct-payment.dto.ts
git commit -m "refactor(payment): saveCard mantığı ve PaymentMethod servis metotlarını kaldır"
```

---

### Task A3: PaymentMethod controller endpoint'lerini kaldır

**Files:**
- Modify: `apps/api/src/modules/payment/payment.controller.ts` (methods endpoint'leri 195-259)

- [ ] **Step 1: 4 endpoint'i sil**

`getPaymentMethods` (GET /methods, 195-201), `addPaymentMethod` (POST /methods, 206-228), `deletePaymentMethodRoute` (DELETE /methods/:id, 233-244), `setDefaultPaymentMethod` (PATCH /methods/:id/default, 249-259) handler'larının tamamını sil. Kullanılmayan import'ları (DTO'lar) temizle.

- [ ] **Step 2: API derlemesini doğrula**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PaymentMethod ile ilgili TS hatası KALMAMALI (Prisma `paymentMethod` modeli hâlâ var, o yüzden schema henüz hata vermez). Hata varsa kalan referansları temizle.

- [ ] **Step 3: Mevcut payment testleri hâlâ geçiyor mu**

Run: `cd apps/api && npm run test -- payment`
Expected: PASS (veya önceden skip olanlar skip).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payment/payment.controller.ts
git commit -m "refactor(payment): PaymentMethod controller endpoint'lerini kaldır"
```

---

### Task A4: `UserMembership.paymentMethodId` auto-renew bağımlılığını gözden geçir ve gate'le

**Files:**
- Inspect/Modify: `apps/api/src/modules/membership/**` (paymentMethodId okuyan auto-renew kodu)

- [ ] **Step 1: paymentMethodId kullanımını ara**

Run: `cd apps/api && grep -rn "paymentMethodId" src/`
Expected: `UserMembership.paymentMethodId`'yi okuyan/yazan yerleri listeler (özellikle auto-renew).

- [ ] **Step 2: Auto-renew-by-saved-card varsa devre dışı bırak**

Eğer auto-renew kayıtlı karttan otomatik çekim yapıyorsa: Faz 1'de kayıtlı kart olmadığı için bu çalışamaz. İlgili auto-renew tetikleyici kodu, kullanıcıyı normal ödeme akışına yönlendirecek şekilde gate'le (örn. "yenileme için tekrar ödeme gerekir" bildirimi) veya kod yolunu no-op yap. Tam değişiklik, bulunan koda göre yapılır — kart token'ı olmadan PayTR'den çekim mümkün olmadığını esas al.

- [ ] **Step 3: Derleme + ilgili testler**

Run: `cd apps/api && npx tsc --noEmit && npm run test -- membership`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/membership
git commit -m "refactor(membership): kayıtlı karttan auto-renew'i Faz 1 için gate'le"
```

---

### Task A5: PaymentMethod Prisma modelini ve migration'ı kaldır

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model 83-98, User relation 56, UserMembership.paymentMethodId 261)
- Create: yeni migration (drop table)

- [ ] **Step 1: schema.prisma'dan PaymentMethod modelini ve relation'ı sil**

- `model PaymentMethod { ... }` (83-98) tamamen sil.
- `User` modelinden `paymentMethods PaymentMethod[]` (56) satırını sil.
- `UserMembership` modelinden `paymentMethodId String? @map("payment_method_id")` (261) satırını sil (auto-renew artık kayıtlı kart kullanmıyor).

- [ ] **Step 2: Migration üret**

Run: `cd apps/api && npx prisma migrate dev --name drop_payment_methods`
Expected: `payment_methods` tablosunu DROP eden ve `user_memberships.payment_method_id` kolonunu kaldıran migration üretilir + dev DB'ye uygulanır.

- [ ] **Step 3: Prisma client generate + derleme**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit`
Expected: `prisma.paymentMethod`'a kalan referans yoksa temiz derleme. Hata varsa kalan referansları temizle.

- [ ] **Step 4: API'yi başlat, sağlık kontrolü**

Run: `cd apps/api && (npm run start:dev &) ` ardından `sleep 25 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health`
Expected: 200. (Sonra dev süreçlerini normal akışta yönetirsin.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(payment): PaymentMethod tablosunu ve paymentMethodId kolonunu kaldır (migration)"
```

---

## FAZ B — Web: tek iFrame ödeme sayfası + saved-card UI kaldırma

### Task B1: `payment/[id]/page.tsx`'i tek iFrame görünümüne indir

**Files:**
- Modify: `apps/web/src/app/payment/[id]/page.tsx`

- [ ] **Step 1: Dosyayı oku ve silinecek/kalacak blokları işaretle**

Sil:
- `payMode` state'i (33) ve "card"/"iframe" toggle butonları (486-497, 520-530)
- Kart formu render bloğu (376-498): name/number/expiry/cvv inputları, "Kartı Kaydet" checkbox (458-467), submit (469-480)
- `cardForm`, `saveCard`, `cardSubmitting` state'leri (34-36)
- `formatCardNumber`, `formatExpiry` (130-138)
- `handleDirectPay` fonksiyonu (141-229)

Kalsın:
- `paymentHtml` (PayTR iframe) render bloğu (499-514) — ama toggle linkleri olmadan
- `payment.paymentUrl` redirect mantığı
- `fetchPayment`, durum/polling (`handlePaymentComplete`)

- [ ] **Step 2: iFrame'i koşulsuz tek görünüm yap**

Render'da koşulu sadeleştir: `payment.status === 'pending'` ise `paymentHtml` varsa iFrame'i, yoksa `paymentUrl`'e yönlendirmeyi/yükleniyor durumunu göster. `payMode` koşullarını kaldır. iFrame bloğu:

```tsx
{payment?.status === 'pending' && paymentHtml ? (
  <div
    className="paytr-iframe-container"
    dangerouslySetInnerHTML={{ __html: paymentHtml }}
  />
) : payment?.status === 'pending' && payment?.paymentUrl ? (
  // paymentUrl'e yönlendir (mevcut redirect mantığını koru)
  <RedirectToPayment url={payment.paymentUrl} />
) : (
  <PaymentStatusView payment={payment} />
)}
```

(`RedirectToPayment`/`PaymentStatusView` yerine mevcut dosyadaki eşdeğer mevcut bloğu kullan — yeni bileşen icat etme, var olanı sadeleştir.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "payment/\[id\]"`
Expected: Bu dosyaya ait hata yok (silinen state/fonksiyon referansı kalmamalı).

- [ ] **Step 4: Manuel doğrulama (dev çalışırken)**

Bir sipariş için `/payment/{id}` aç. Beklenen: tek PayTR iFrame; kart formu, "PayTR'ye geç"/"kart bilgilerimi gir" toggle'ı YOK.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/payment/\[id\]/page.tsx
git commit -m "feat(web/payment): ödeme sayfasını tek iFrame görünümüne indir (dual-form kaldırıldı)"
```

---

### Task B2: Web saved-card UI ve api.ts kart metotlarını kaldır

**Files:**
- Delete: `apps/web/src/app/payment-methods/page.tsx`
- Modify: `apps/web/src/lib/api.ts` (399-452: getMethods/addMethod/deleteMethod/setDefaultMethod/processDirect/getPaymentMethods/addPaymentMethod/deletePaymentMethod)
- Modify: `apps/web/src/app/membership/checkout/page.tsx` (62, 273, 416), `membership/manage/page.tsx` (66, 131-145)

- [ ] **Step 1: payment-methods sayfasını sil**

Run: `rm apps/web/src/app/payment-methods/page.tsx`
Bu route'a link veren yerleri ara ve kaldır: `cd apps/web && grep -rn "payment-methods" src/` → çıkan menü/link referanslarını temizle.

- [ ] **Step 2: api.ts'ten kart metotlarını sil**

`paymentsApi` içinden şunları sil: `getMethods`, `addMethod`, `deleteMethod`, `setDefaultMethod`, `processDirect`, `getPaymentMethods`, `addPaymentMethod`, `deletePaymentMethod` (399-452 arası).

- [ ] **Step 3: membership checkout/manage'den saveCard + kart seçimini kaldır**

`membership/checkout/page.tsx`: `saveCard` state'i, checkbox, `processDirect` çağrısını kaldır; üyelik ödemesini de normal `initiate` → `/payment/{id}` (iFrame) akışına bağla. `membership/manage/page.tsx`: kayıtlı kart seçme/ekleme UI'sını (66, 131-145) kaldır.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -E "payment-methods|membership|api.ts"`
Expected: İlgili dosyalarda hata yok.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/app/membership
git commit -m "refactor(web): saved-card UI ve api kart metotlarını kaldır, üyelik ödemesini iFrame'e bağla"
```

---

## FAZ C — Mobil: saved-card ekranı + saveCard + Direct API kaldırma

### Task C1: Mobil payment-methods ekranı ve saveCard kullanımını kaldır

**Files:**
- Delete: `apps/mobile/app/settings/payment-methods.tsx`
- Modify: `apps/mobile/app/checkout/index.tsx` (170, 561), `apps/mobile/app/membership/checkout.tsx` (89, 152, 334-342)
- Modify: `apps/mobile/src/services/api.ts` (656)

- [ ] **Step 1: Mobil payment-methods ekranını sil ve linklerini temizle**

Run: `rm apps/mobile/app/settings/payment-methods.tsx`
Run: `cd apps/mobile && grep -rn "payment-methods" app/ src/` → menü/route linklerini kaldır.

- [ ] **Step 2: checkout ve membership'ten saveCard + Direct API çağrısını kaldır**

`app/checkout/index.tsx`: `saveCard` state'i (170) ve `paymentsApi.processDirect({...saveCard})` çağrısını (561) kaldır; mobil checkout'u `initiate` → PayTR iFrame/WebView akışına bağla (web ile aynı: barındırılan sayfayı WebView'da aç). `app/membership/checkout.tsx`: saveCard (89, 152, 334-342) kaldır.

- [ ] **Step 3: Mobil api.ts'ten kart metotlarını sil**

`apps/mobile/src/services/api.ts` (656 civarı) `paymentMethods`/`processDirect` metotlarını sil.

- [ ] **Step 4: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "payment-methods|checkout|membership|api"`
Expected: İlgili dosyalarda hata yok.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app apps/mobile/src/services/api.ts
git commit -m "refactor(mobile): saved-card ekranı, saveCard ve Direct API çağrılarını kaldır"
```

---

## FAZ D — Geri dönüş (resume) netliği

### Task D1: Süresi dolmuş iFrame token'da aynı siparişe yeni token al

**Files:**
- Modify: `apps/web/src/app/payment/[id]/page.tsx` (fetchPayment / token alma)
- (Backend `initiate` zaten `pending_payment` siparişe yeni token üretir; `processPaymentInitiation` 968-980 CAS gate ile re-acquire eder — değiştirme.)

- [ ] **Step 1: Davranışı doğrula (oku)**

`payment/[id]/page.tsx` ödeme sayfasına dönüldüğünde nasıl token alıyor? PayTR iFrame token'ı tek kullanımlık ve ~300s. Süre dolmuş/used token'da iFrame boş gelir.

- [ ] **Step 2: Sayfa açılışında taze token al**

`/payment/{id}` mount olduğunda, sipariş hâlâ `pending_payment` ve süre dolmadıysa `paymentsApi.initiate`/`initiateGroup` (uygun olanı) ile **taze** `paymentHtml` al ve göster. Süre dolduysa (`paymentExpiresAt` geçmiş) backend zaten 30dk cron + kill-switch ile temizler; sayfa "ödeme süresi doldu, ürün tekrar satışta" mesajı + ilgili ürün linkini göstersin (mevcut fail/unavailable mantığını kullan).

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "payment/\[id\]"`
Expected: Hata yok.

- [ ] **Step 4: Manuel doğrulama**

`/payment/{id}` aç → geri git → tekrar aç. Beklenen: yeni iFrame yüklenir (aynı sipariş), "ödeme atlanıyor" hissi yok. 30dk sonra aç: temiz "süre doldu" mesajı.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/payment/\[id\]/page.tsx
git commit -m "fix(web/payment): geri dönüşte aynı siparişe taze iFrame token al"
```

---

## FAZ E — Doğrulama & temizlik

### Task E1: Uçtan uca derleme + test geçişi

- [ ] **Step 1: API**

Run: `cd apps/api && npx tsc --noEmit && npm run test -- payment`
Expected: Derleme temiz, payment testleri PASS.

- [ ] **Step 2: Web**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "e2e/"`
Expected: Yeni hata yok (önceden var olan e2e hataları hariç).

- [ ] **Step 3: Mobile**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: Yeni hata yok.

- [ ] **Step 4: `process-direct` / kart endpoint'lerinin gittiğini doğrula**

Run: `cd apps/api && grep -rn "addPaymentMethod\|getPaymentMethods\|processDirect\|saveCard\|paymentMethod" src/ | grep -iv "node_modules"`
Expected: Yalnızca kasıtlı kalanlar (örn. yorum) — ölü referans yok.

- [ ] **Step 5: Commit (varsa kalan temizlik)**

```bash
git add -A
git commit -m "chore(payment): tek iFrame + PaymentMethod kaldırma temizliği"
```

---

## Notlar

- **State machine'e dokunulmadı:** `processSuccessfulPayment` CAS gate + auto-refund mantığı korunur. "Satın alınmış gözüküyor" ince yarışının kalan kısmı, bu plan bittikten sonra **reproduce-first** ayrı bir görevle (systematic-debugging) ele alınır.
- **PayTR Faz 2 (kayıtlı kart):** Direct API + Non3D aktivasyonu gerektirir; ayrı spec/plan.
- **Veritabanı:** `drop_payment_methods` migration'ı geri alınamaz veri kaybıdır (kayıtlı kart metadata'sı). Faz 1 kararı gereği kasıtlı.
