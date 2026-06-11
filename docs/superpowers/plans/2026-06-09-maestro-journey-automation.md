# Maestro Journey Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manuel uçtan uca test yolculuklarını, kullanıcının açık iOS simülatöründe görünür şekilde koşan ve hem UI hem backend state'i doğrulayan Maestro otomasyonuna çevirmek; ilk hedef Yolculuk 1 (yeni alıcı ilk alışveriş).

**Architecture:** İki katman. (1) Yerel koşum harness'i (`run.sh` + `pnpm maestro:dev`) backend health + booted simülatör + `EXPO_PUBLIC_MAESTRO=1` Metro'yu garanti edip `maestro test`'i ön planda görünür koşar. (2) Hibrit journey orkestrasyonu: Maestro alıcı UI segmentlerini sürer, aralara giren `journey-driver.js` (Prisma) alıcının telefonundan yapılamayan geçişleri (email-verify, adres seed, satıcı kargolama/teslim, hold-release assert) yapar. Benzersiz `REG_EMAIL` ile her run kendi kullanıcısını/siparişini yaratır.

**Tech Stack:** Maestro 2.5 (YAML flows), Expo dev-client (`com.tarodan.app`), NestJS + Prisma (PostgreSQL), Node.js script (driver), bash (orkestrasyon).

---

## Doğrulanmış gerçekler (keşiften)

- **Auto-login:** [authStore.ts:359](../../../apps/mobile/src/stores/authStore.ts#L359) — `EXPO_PUBLIC_MAESTRO==='1'` ve SecureStore'da token yoksa `zeynep@demo.com` (veya `EXPO_PUBLIC_MAESTRO_EMAIL`) ile otomatik giriş.
- **Bypass ödeme yan etkileri:** Ödeme `completed` olunca backend otomatik: Invoice üretir, Shipment (`status=pending`, `trackingNumber=orderNumber`) yaratır, PaymentHold (`status=held`) açar, Order `pending_payment → preparing`.
- **Confirm delivery:** `POST /orders/:id/confirm` → `order.service.confirmDelivery` → Order `delivered → completed` + `releasePaymentIfHeld` (hold `released`). Mobil: [orders/index.tsx:303](../../../apps/mobile/app/orders/index.tsx#L303) "Teslim Aldım" butonu, buyer + status `delivered`/`awaiting_confirmation` iken görünür; `ordersApi.confirm(id)` çağırır.
- **OrderStatus enum:** `pending_payment, paid, preparing, shipped, delivered, awaiting_buyer_confirmation, completed, cancelled, refund_requested, refunded`.
- **PaymentStatus:** `pending, processing, completed, failed, refunded`. **PaymentHoldStatus:** `held, released, cancelled`. **ShipmentStatus:** `pending … delivered …`.
- **Order alanları:** `buyerId, sellerId, status, deliveredAt, confirmationDeadline, buyerConfirmedAt, completedAt, orderNumber`. Buyer'ın son siparişi: `where {buyerId} orderBy {createdAt desc}`.
- **Email verify:** Token DB'de **SHA256 hash**'li saklanıyor (raw yok) → driver doğrudan `user.isEmailVerified=true` set eder. Alan: `User.isEmailVerified`.
- **Address zorunlu alanları:** `userId, fullName, phone, city, district, address` (+ opsiyonel `title, zipCode, isDefault`).
- **Register form testID'leri:** `register-displayName-input, register-email-input, register-birthDate-input, register-password-input, register-submit-button`. **Eksik:** confirmPassword + acceptTerms testID'leri (Task 4'te eklenir). birthDate bir spinner DateField → Maestro süremiyor (Task 4'te MAESTRO modunda default'lanır).
- **Checkout adres:** Üye için kayıtlı adresten seçer; adres yoksa akış tıkanır → driver yeni kullanıcıya default adres seed eder.
- **Mevcut bypass zinciri (referans):** [F-23](../../../apps/mobile/maestro/flows/F-23-bypass-complete-end-to-end.yaml) — selector'lar: `search-input`, `product-detail-add-to-cart-button`, "Sepete Git", `cart-checkout-button`, "Teslimat Bilgileri", "Devam Et", ödeme tamamla, "ORD-", `profile-orders-link`.

## Dosya yapısı

| Dosya | Sorumluluk | Create/Modify |
|---|---|---|
| `apps/mobile/maestro/run.sh` | Yerel koşum harness'i (health+sim+metro+maestro) | Create |
| `apps/mobile/package.json` | `maestro:dev` script kaydı | Modify |
| `apps/mobile/maestro/README.md` | Drift düzeltme (Expo Go → dev build gerçeği) | Modify |
| `apps/mobile/src/stores/authStore.ts` | `EXPO_PUBLIC_MAESTRO_NO_AUTOLOGIN` guard | Modify |
| `apps/mobile/app/(auth)/register.tsx` | confirmPassword/acceptTerms testID + MAESTRO birthDate default | Modify |
| `apps/api/scripts/journey-driver.js` | Driver: verify-email, seed-address, advance-to-delivered, assert-invoice, assert-completed | Create |
| `apps/mobile/maestro/flows/J1-a-register-buy.yaml` | Yolculuk 1 UI segment A: misafir gez + kayıt | Create |
| `apps/mobile/maestro/flows/J1-b-login-buy.yaml` | Yolculuk 1 UI segment B: giriş + sepet + checkout + ödeme | Create |
| `apps/mobile/maestro/flows/J1-c-confirm-delivery.yaml` | Yolculuk 1 UI segment C: teslim onayı + tamamlandı | Create |
| `apps/mobile/maestro/journeys/run-journey-1.sh` | Yolculuk 1 orkestrasyon (UI segmentleri + driver + assert) | Create |

---

## Task 1: Koşum harness'i — `run.sh` + pnpm script

**Files:**
- Create: `apps/mobile/maestro/run.sh`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: `run.sh` dosyasını oluştur**

`apps/mobile/maestro/run.sh`:

```bash
#!/usr/bin/env bash
# Maestro yerel koşum harness'i.
# Görünür, booted simülatörde flow koşturur. Backend + Metro (EXPO_PUBLIC_MAESTRO=1)
# ön koşullarını garanti eder.
#
# Kullanım:
#   ./run.sh flows/01-smoke.yaml
#   MAESTRO_EMAIL=ahmet@demo.com ./run.sh flows/E-05-membership-manage.yaml
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3001/api}"
METRO_PORT="${METRO_PORT:-8081}"
MAESTRO_EMAIL="${MAESTRO_EMAIL:-zeynep@demo.com}"
MAESTRO_PASSWORD="${MAESTRO_PASSWORD:-Demo123!}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[1;36m[harness]\033[0m %s\n' "$1"; }
err() { printf '\033[1;31m[harness]\033[0m %s\n' "$1" >&2; }

# 1. Backend health
log "Backend kontrol: $API_URL/categories"
if ! curl -fsS -o /dev/null "$API_URL/categories"; then
  err "Backend ayakta değil ($API_URL). Önce: cd apps/api && pnpm dev"
  exit 1
fi

# 2. Booted simülatör
log "Booted iOS simülatör kontrol"
if ! xcrun simctl list devices booted | grep -q "Booted"; then
  err "Booted simülatör yok. Simülatörü aç (open -a Simulator) ve uygulamayı yükle."
  exit 1
fi

# 3. Metro (EXPO_PUBLIC_MAESTRO=1)
if lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  log "Metro zaten $METRO_PORT portunda çalışıyor (auto-login için EXPO_PUBLIC_MAESTRO=1 ile başlatılmış olmalı)"
else
  log "Metro başlatılıyor (EXPO_PUBLIC_MAESTRO=1, email=$MAESTRO_EMAIL)…"
  ( cd "$MOBILE_DIR" && \
    EXPO_PUBLIC_MAESTRO=1 \
    EXPO_PUBLIC_MAESTRO_EMAIL="$MAESTRO_EMAIL" \
    EXPO_PUBLIC_MAESTRO_PASSWORD="$MAESTRO_PASSWORD" \
    nohup pnpm exec expo start --dev-client --port "$METRO_PORT" --clear \
    >/tmp/tarodan-metro.log 2>&1 & )
  log "Metro bundler hazırlanıyor; port bekleniyor…"
  for _ in $(seq 1 60); do
    lsof -nP -iTCP:"$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 2
  done
  log "Metro hazır. (log: /tmp/tarodan-metro.log)"
fi

# 4. Maestro — ön planda, görünür simülatörde
log "maestro test $* — simülatörü izle"
cd "$MOBILE_DIR/maestro"
exec maestro test "$@"
```

- [ ] **Step 2: Çalıştırılabilir yap**

Run: `chmod +x apps/mobile/maestro/run.sh`
Expected: çıktı yok, exit 0.

- [ ] **Step 3: `pnpm maestro:dev` script'ini ekle**

`apps/mobile/package.json` `scripts` bloğuna ekle (mevcut `"web": "expo start --web",` satırının altına):

```json
    "maestro:dev": "bash maestro/run.sh",
```

- [ ] **Step 4: Harness'i smoke ile doğrula (görünür koşum)**

Run: `cd apps/mobile && pnpm maestro:dev flows/01-smoke.yaml`
Expected: Simülatörde uygulama açılır, home render olur; terminalde Maestro `01-smoke` adımları `[PASS]`; flow yeşil biter. (Metro yoksa otomatik başlatılır; ilk seferde bundling ~40-60s.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/maestro/run.sh apps/mobile/package.json
git commit -m "feat(maestro): yerel koşum harness'i (run.sh + pnpm maestro:dev)"
```

---

## Task 2: README drift düzeltme

**Files:**
- Modify: `apps/mobile/maestro/README.md:1-10`

- [ ] **Step 1: Yanıltıcı başlık/kurulum bölümünü düzelt**

`apps/mobile/maestro/README.md` dosyasının ilk satırından "## Kurulum" başlığına kadar olan bölümü aşağıdakiyle değiştir. Eski metin Expo Go + dev build gerektirmez diyor; gerçek: dev build (`com.tarodan.app`) + `EXPO_PUBLIC_MAESTRO=1` auto-login.

Eski (sil):

```markdown
# Tarodan Mobile — Maestro E2E Test Suite

Bu klasör mobil uygulamanın e2e test akışlarını barındırır. [Maestro](https://maestro.mobile.dev) kullanılır — YAML tabanlı, Expo Go ile doğrudan çalışır, dev build gerektirmez.
```

Yeni:

```markdown
# Tarodan Mobile — Maestro E2E Test Suite

Bu klasör mobil uygulamanın e2e test akışlarını barındırır. [Maestro](https://maestro.mobile.dev) kullanılır — YAML tabanlı.

> **Önemli:** Flow'lar **Expo Go değil, dev build**'i hedefler (`appId: com.tarodan.app`).
> Test koşumu için Metro **`EXPO_PUBLIC_MAESTRO=1`** ile başlatılmalı; bu, [authStore.loadToken](../src/stores/authStore.ts) içindeki auto-login'i açar (login UI'sını atlar). En kolay yol: **`pnpm maestro:dev <flow>`** (bkz. [run.sh](run.sh)) — backend health + booted simülatör + Metro'yu garanti edip flow'u görünür simülatörde koşar.
```

- [ ] **Step 2: Çalıştırma bölümüne harness'i ekle**

`apps/mobile/maestro/README.md` içinde "## Çalıştırma" başlığının hemen altındaki ilk kod bloğundan önce şu satırları ekle:

```markdown
**Önerilen (harness):**

```bash
cd apps/mobile
pnpm maestro:dev flows/01-smoke.yaml          # tek flow, görünür simülatörde
MAESTRO_EMAIL=ahmet@demo.com pnpm maestro:dev flows/E-05-membership-manage.yaml
```

**Düşük seviye (manuel):**
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/maestro/README.md
git commit -m "docs(maestro): README drift düzeltme (dev build + EXPO_PUBLIC_MAESTRO gerçeği + harness)"
```

---

## Task 3: Auto-login'i journey için kapatılabilir yap

`EXPO_PUBLIC_MAESTRO=1` hem password unmask hem testID davranışı için gerekli, ama Yolculuk 1 yeni kullanıcı kaydı + UI login test ettiğinden zeynep auto-login'i istemeyiz. Yeni bir guard ekle.

**Files:**
- Modify: `apps/mobile/src/stores/authStore.ts:359`

- [ ] **Step 1: Guard koşulunu güncelle**

`apps/mobile/src/stores/authStore.ts` içinde:

Eski:

```typescript
      } else if (process.env.EXPO_PUBLIC_MAESTRO === '1') {
```

Yeni:

```typescript
      } else if (
        process.env.EXPO_PUBLIC_MAESTRO === '1' &&
        process.env.EXPO_PUBLIC_MAESTRO_NO_AUTOLOGIN !== '1'
      ) {
```

- [ ] **Step 2: TypeScript doğrula**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep authStore || echo OK`
Expected: `OK` (authStore'da hata yok).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/stores/authStore.ts
git commit -m "feat(mobile): EXPO_PUBLIC_MAESTRO_NO_AUTOLOGIN ile auto-login'i opsiyonel kapat (journey register akışı)"
```

---

## Task 4: Register formunu Maestro-otomatize edilebilir yap

birthDate spinner DateField Maestro'dan sürülemez; confirmPassword + acceptTerms testID'siz. Üçünü düzelt.

**Files:**
- Modify: `apps/mobile/app/(auth)/register.tsx`

- [ ] **Step 1: MAESTRO modunda birthDate default'u ver**

`apps/mobile/app/(auth)/register.tsx` içinde `useForm` çağrısındaki `defaultValues`'ı bul:

Eski:

```typescript
    defaultValues: { acceptTerms: false },
```

Yeni:

```typescript
    defaultValues: {
      acceptTerms: false,
      // Maestro spinner DateField'ı süremez; test modunda geçerli (18+) bir
      // doğum tarihi öndoldurulur. Prod'da EXPO_PUBLIC_MAESTRO unset → '' .
      birthDate: process.env.EXPO_PUBLIC_MAESTRO === '1' ? '1990-01-01' : '',
    },
```

- [ ] **Step 2: confirmPassword input'una testID ekle**

`apps/mobile/app/(auth)/register.tsx` içinde confirmPassword `Controller` → `Input`'una `testID="register-confirmPassword-input"` ekle (mevcut password input'unun testID pattern'ini izle). Input zaten `error={errors.confirmPassword?.message}` içeriyor; aynı bloğa `testID` prop'u ekle.

- [ ] **Step 3: acceptTerms kontrolüne testID ekle**

`apps/mobile/app/(auth)/register.tsx` içinde `acceptTerms` Controller'ının render ettiği dokunulabilir öğeye (Checkbox/Switch/Pressable) `testID="register-acceptTerms"` ekle. Hangi bileşen olduğunu dosyayı okuyarak teyit et; tap hedefi olan en dış öğeye koy.

- [ ] **Step 4: TypeScript doğrula**

Run: `cd apps/mobile && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "register.tsx" || echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(auth)/register.tsx
git commit -m "feat(mobile): register formunu Maestro-otomatize edilebilir yap (birthDate default + testID'ler)"
```

---

## Task 5: Journey driver script

Alıcının telefonundan yapılamayan geçişleri Prisma ile yapan/asserteden script.

**Files:**
- Create: `apps/api/scripts/journey-driver.js`

- [ ] **Step 1: Driver script'ini oluştur**

`apps/api/scripts/journey-driver.js`:

```javascript
/**
 * Journey driver — UI dışı yaşam döngüsü geçişleri + state assert.
 * Convention: apps/api/scripts/*.js + require('@prisma/client'), node ile koşar.
 *
 * Komutlar (hepsi --email <buyerEmail> alır; son sipariş = buyerId + en yeni):
 *   verify-email          user.isEmailVerified=true
 *   seed-address          buyer'a default teslimat adresi ekle (yoksa)
 *   advance-to-delivered  son siparişi preparing→delivered + shipment delivered + tracking
 *   assert-invoice        son sipariş için Invoice var mı (yoksa exit 1)
 *   assert-completed      son sipariş completed + paymentHold released (değilse exit 1)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function log(m) { console.log(`[driver] ${m}`); }
function fail(m) { console.error(`[driver] ❌ ${m}`); process.exit(1); }

async function getUser(email) {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) fail(`Kullanıcı yok: ${email}`);
  return u;
}
async function latestOrder(buyerId) {
  const o = await prisma.order.findFirst({
    where: { buyerId },
    orderBy: { createdAt: 'desc' },
  });
  if (!o) fail(`Buyer'ın siparişi yok: ${buyerId}`);
  return o;
}

async function verifyEmail(email) {
  const u = await getUser(email);
  await prisma.user.update({ where: { id: u.id }, data: { isEmailVerified: true } });
  log(`✅ email doğrulandı: ${email}`);
}

async function seedAddress(email) {
  const u = await getUser(email);
  const existing = await prisma.address.findFirst({ where: { userId: u.id } });
  if (existing) { log('adres zaten var, atlandı'); return; }
  await prisma.address.create({
    data: {
      userId: u.id,
      title: 'Test Adresi',
      fullName: 'Test Alıcı',
      phone: '5551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      address: 'Test Mah. Test Sok. No:1 D:2',
      zipCode: '34000',
      isDefault: true,
    },
  });
  log(`✅ default adres seed edildi: ${email}`);
}

async function advanceToDelivered(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  const now = new Date();
  const deadline = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'delivered', deliveredAt: now, confirmationDeadline: deadline },
  });
  // Shipment bypass ödemede otomatik oluşur (status pending). delivered yap.
  const shipment = await prisma.shipment.findUnique({ where: { orderId: order.id } });
  if (shipment) {
    await prisma.shipment.update({
      where: { orderId: order.id },
      data: {
        status: 'delivered',
        shippedAt: shipment.shippedAt ?? now,
        deliveredAt: now,
        trackingNumber: shipment.trackingNumber ?? order.orderNumber,
      },
    });
  }
  log(`✅ sipariş ${order.orderNumber} → delivered (kargo+teslim simüle)`);
}

async function assertInvoice(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  const inv = await prisma.invoice.findFirst({ where: { orderId: order.id } });
  if (!inv) fail(`Fatura oluşmamış (order ${order.orderNumber})`);
  log(`✅ fatura mevcut: ${inv.invoiceNumber}`);
}

async function assertCompleted(email) {
  const u = await getUser(email);
  const order = await latestOrder(u.id);
  if (order.status !== 'completed') fail(`Sipariş completed değil: ${order.status}`);
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (payment) {
    const hold = await prisma.paymentHold.findUnique({ where: { paymentId: payment.id } });
    if (hold && hold.status !== 'released') fail(`Hold release edilmemiş: ${hold.status}`);
    if (hold) log(`✅ hold released (${hold.releasedAt})`);
  }
  log(`✅ sipariş ${order.orderNumber} completed`);
}

const COMMANDS = {
  'verify-email': verifyEmail,
  'seed-address': seedAddress,
  'advance-to-delivered': advanceToDelivered,
  'assert-invoice': assertInvoice,
  'assert-completed': assertCompleted,
};

(async () => {
  const cmd = process.argv[2];
  const email = arg('--email');
  const fn = COMMANDS[cmd];
  if (!fn || !email) {
    console.error('Kullanım: node journey-driver.js <komut> --email <buyerEmail>');
    console.error('Komutlar: ' + Object.keys(COMMANDS).join(', '));
    process.exit(2);
  }
  await fn(email);
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Driver'ı bilinen kullanıcıyla duman-testi (assert yolu)**

Run: `cd apps/api && node scripts/journey-driver.js seed-address --email zeynep@demo.com`
Expected: `[driver] ✅ default adres seed edildi` veya `adres zaten var, atlandı`; exit 0.

- [ ] **Step 3: Hatalı kullanım exit kodunu doğrula**

Run: `cd apps/api && node scripts/journey-driver.js assert-completed --email yok@yok.com; echo "exit=$?"`
Expected: `❌ Kullanıcı yok: yok@yok.com` ve `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/journey-driver.js
git commit -m "feat(api): journey-driver script (verify-email, seed-address, advance-to-delivered, assert-invoice/completed)"
```

---

## Task 6: Yolculuk 1 — UI segment A (kayıt → giriş → satın al)

**Files:**
- Create: `apps/mobile/maestro/flows/J1-a-register-buy.yaml`

Bu segment misafir gezinme → arama → detay → kayıt formu submit ile başlar. Sonra orkestratör driver `verify-email` + `seed-address` çalıştırır; ardından bu segment **ikinci kez** çağrılamaz, bunun yerine login + satın alma ayrı bir runFlow ile aynı dosyada `runFlow.when` ile koşullanır. Basitlik için: segment A SADECE misafir gezinme + kayıt yapar; login+satın alma orkestratörde driver'dan sonra `J1-a2` ile değil, aynı dosyada login bloğunu `verify` sonrası sürdürmek mümkün olmadığından, login+buy ayrı dosyaya alınır (Task 6b). Bu task A = guest browse + register.

- [ ] **Step 1: J1-a flow'unu oluştur**

`apps/mobile/maestro/flows/J1-a-register-buy.yaml`:

```yaml
# Yolculuk 1 — Segment A: misafir gezinme → arama → ürün detay → kayıt formu submit.
# Auto-login KAPALI çalışır (EXPO_PUBLIC_MAESTRO_NO_AUTOLOGIN=1) ki yeni kullanıcı
# akışı zeynep ile ezilmesin. Kayıt sonrası orkestrator driver verify-email+seed-address
# koşar, sonra J1-b-login-buy.yaml devam eder.
# Gerekli env: REG_EMAIL (benzersiz), REG_PASSWORD, REG_NAME.
appId: com.tarodan.app
tags:
  - manual
env:
  REG_EMAIL: maestro-j1@demo.com
  REG_PASSWORD: Demo123!
  REG_NAME: Maestro Alıcı
---
- launchApp:
    appId: com.tarodan.app
    clearState: false
- waitForAnimationToEnd:
    timeout: 5000
- tapOn:
    text: "Continue"
    optional: true
# 1. Misafir ana sayfa: login ekranı gelirse "Misafir Olarak Devam Et"
- runFlow:
    when:
      visible:
        id: "continue-as-guest-button"
    commands:
      - tapOn:
          id: "continue-as-guest-button"
- extendedWaitUntil:
    visible: "Kategoriler"
    timeout: 120000
# 2. Arama → ilk ürün detay
- tapOn:
    text: "Ara"
- extendedWaitUntil:
    visible:
      id: "search-input"
    timeout: 15000
- tapOn:
    id: "search-input"
- inputText: "diecast"
- waitForAnimationToEnd:
    timeout: 5000
- tapOn:
    text: ".*₺.*"
    index: 0
- extendedWaitUntil:
    visible:
      id: "product-detail-add-to-cart-button"
    timeout: 15000
# 3. Kayıt ol: detaydan profile/girişe gidip kayıt ekranını aç
- tapOn:
    text: "Profil"
- extendedWaitUntil:
    visible:
      id: "profile-go-login-button"
    timeout: 15000
- tapOn:
    id: "profile-go-login-button"
- extendedWaitUntil:
    visible:
      id: "login-email-input"
    timeout: 15000
# Login ekranından "Kayıt Ol" linkine git
- tapOn:
    text: "Kayıt Ol"
- extendedWaitUntil:
    visible:
      id: "register-displayName-input"
    timeout: 15000
- tapOn:
    id: "register-displayName-input"
- inputText: "${REG_NAME}"
- tapOn:
    id: "register-email-input"
- inputText: "${REG_EMAIL}"
- tapOn:
    id: "register-password-input"
- inputText: "${REG_PASSWORD}"
- tapOn:
    id: "register-confirmPassword-input"
- inputText: "${REG_PASSWORD}"
- tapOn:
    id: "register-acceptTerms"
# birthDate MAESTRO modunda öndolu (1990-01-01); dokunma.
- tapOn:
    id: "register-submit-button"
# Başarılı kayıt → login ekranına döner (register.tsx onSuccess router.replace login)
- extendedWaitUntil:
    visible:
      id: "login-email-input"
    timeout: 20000
- assertVisible:
    id: "login-email-input"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/maestro/flows/J1-a-register-buy.yaml
git commit -m "feat(maestro): Yolculuk 1 segment A (misafir gez + kayıt)"
```

> Not: Bu segment tek başına driver olmadan login ekranında biter; doğrulaması orkestratör koşumunda yapılır (Task 8 Step). `register-email-input` vb. testID'ler [register.tsx](../../../apps/mobile/app/(auth)/register.tsx) içinde mevcut.

---

## Task 6b: Yolculuk 1 — UI segment B (giriş → sepet → checkout → ödeme)

**Files:**
- Create: `apps/mobile/maestro/flows/J1-b-login-buy.yaml`

- [ ] **Step 1: J1-b flow'unu oluştur**

`apps/mobile/maestro/flows/J1-b-login-buy.yaml`:

```yaml
# Yolculuk 1 — Segment B: yeni kullanıcı ile giriş → arama → sepete ekle →
# checkout (seed'li adres) → bypass ödeme → sipariş oluştu.
# Ön koşul (orkestrator garanti eder): REG_EMAIL kayıtlı + email verified +
# default adres seed'li + PAYMENT_BYPASS=true.
appId: com.tarodan.app
tags:
  - manual
env:
  REG_EMAIL: maestro-j1@demo.com
  REG_PASSWORD: Demo123!
---
- launchApp:
    appId: com.tarodan.app
    clearState: false
- waitForAnimationToEnd:
    timeout: 5000
- tapOn:
    text: "Continue"
    optional: true
# Giriş: Profil → Giriş Yap → REG_EMAIL
- tapOn:
    text: "Profil"
- runFlow:
    when:
      visible:
        id: "profile-go-login-button"
    commands:
      - tapOn:
          id: "profile-go-login-button"
      - extendedWaitUntil:
          visible:
            id: "login-email-input"
          timeout: 15000
      - tapOn:
          id: "login-email-input"
      - inputText: "${REG_EMAIL}"
      - tapOn:
          id: "login-password-input"
      - inputText: "${REG_PASSWORD}"
      - tapOn:
          id: "login-submit-button"
      - extendedWaitUntil:
          visible:
            text: "Ana Sayfa"
          timeout: 60000
      - tapOn:
          text: "Şimdi Değil"
          optional: true
# 4. Sepete ekle
- tapOn:
    text: "Ara"
- extendedWaitUntil:
    visible:
      id: "search-input"
    timeout: 15000
- tapOn:
    id: "search-input"
- inputText: "diecast"
- waitForAnimationToEnd:
    timeout: 5000
- tapOn:
    text: ".*₺.*"
    index: 0
- extendedWaitUntil:
    visible:
      id: "product-detail-add-to-cart-button"
    timeout: 15000
- tapOn:
    id: "product-detail-add-to-cart-button"
- tapOn:
    text: "Sepete Git"
    optional: true
# 4b. Sepet özeti: toplam görünür
- extendedWaitUntil:
    visible:
      id: "cart-checkout-button"
    timeout: 15000
- assertVisible:
    text: ".*Toplam.*"
# 5. Checkout → Teslimat (seed'li adres) → Devam Et
- tapOn:
    id: "cart-checkout-button"
- extendedWaitUntil:
    visible: "Teslimat Bilgileri"
    timeout: 20000
- tapOn:
    text: "Devam Et.*"
# 6. Ödeme → bypass → başarı
- extendedWaitUntil:
    visible:
      text: ".*Ödeme.*Tamamla.*|.*Ödemeyi.*"
    timeout: 20000
- tapOn:
    text: ".*Ödeme.*Tamamla.*|.*Ödemeyi.*"
- extendedWaitUntil:
    visible:
      text: ".*başarı.*|Sipariş.*tamamland.*|Tamamlandı"
    timeout: 30000
# Sipariş oluştu doğrulama: Siparişlerim'de ORD-
- tapOn:
    text: "Profil"
- tapOn:
    id: "profile-orders-link"
- extendedWaitUntil:
    visible: "ORD-"
    timeout: 20000
- assertVisible: "ORD-"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/maestro/flows/J1-b-login-buy.yaml
git commit -m "feat(maestro): Yolculuk 1 segment B (giriş + sepet + checkout + bypass ödeme)"
```

---

## Task 7: Yolculuk 1 — UI segment C (teslim onayı)

**Files:**
- Create: `apps/mobile/maestro/flows/J1-c-confirm-delivery.yaml`

- [ ] **Step 1: J1-c flow'unu oluştur**

`apps/mobile/maestro/flows/J1-c-confirm-delivery.yaml`:

```yaml
# Yolculuk 1 — Segment C: alıcı Siparişlerim'de "Teslim Aldım" ile teslimatı
# onaylar → backend order completed + hold release. Ardından sipariş tamamlandı
# durumu UI'da doğrulanır.
# Ön koşul (orkestrator): REG_EMAIL ile giriş yapılmış olabilir; değilse login.
# Sipariş driver tarafından 'delivered' duruma getirilmiş olmalı.
appId: com.tarodan.app
tags:
  - manual
env:
  REG_EMAIL: maestro-j1@demo.com
  REG_PASSWORD: Demo123!
---
- launchApp:
    appId: com.tarodan.app
    clearState: false
- waitForAnimationToEnd:
    timeout: 5000
- tapOn:
    text: "Continue"
    optional: true
# Giriş garanti (oturum düşmüşse)
- tapOn:
    text: "Profil"
- runFlow:
    when:
      visible:
        id: "profile-go-login-button"
    commands:
      - tapOn:
          id: "profile-go-login-button"
      - extendedWaitUntil:
          visible:
            id: "login-email-input"
          timeout: 15000
      - tapOn:
          id: "login-email-input"
      - inputText: "${REG_EMAIL}"
      - tapOn:
          id: "login-password-input"
      - inputText: "${REG_PASSWORD}"
      - tapOn:
          id: "login-submit-button"
      - extendedWaitUntil:
          visible:
            text: "Ana Sayfa"
          timeout: 60000
      - tapOn:
          text: "Şimdi Değil"
          optional: true
# 9. Siparişlerim → Teslim Aldım
- tapOn:
    text: "Profil"
- extendedWaitUntil:
    visible:
      id: "profile-orders-link"
    timeout: 15000
- tapOn:
    id: "profile-orders-link"
- extendedWaitUntil:
    visible:
      text: "Teslim Aldım"
    timeout: 20000
- tapOn:
    text: "Teslim Aldım"
- runFlow:
    when:
      visible: "Onayla"
    commands:
      - tapOn: "Onayla"
# Son: sipariş durumu tamamlandı/onaylandı görünür
- extendedWaitUntil:
    visible:
      text: ".*Tamamland.*|.*Onaylan.*"
    timeout: 20000
- assertVisible:
    text: ".*Tamamland.*|.*Onaylan.*"
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/maestro/flows/J1-c-confirm-delivery.yaml
git commit -m "feat(maestro): Yolculuk 1 segment C (teslim onayı + tamamlandı doğrulama)"
```

---

## Task 8: Yolculuk 1 orkestratörü

UI segmentleri + driver çağrılarını sırayla, görünür loglarla koşar. Benzersiz `REG_EMAIL` üretir.

**Files:**
- Create: `apps/mobile/maestro/journeys/run-journey-1.sh`

- [ ] **Step 1: Orkestratör script'ini oluştur**

`apps/mobile/maestro/journeys/run-journey-1.sh`:

```bash
#!/usr/bin/env bash
# Yolculuk 1 — uçtan uca orkestrasyon (görünür simülatörde).
# UI segmentleri Maestro ile, UI dışı geçişler journey-driver ile.
#
# Kullanım: bash maestro/journeys/run-journey-1.sh
set -euo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$(cd "$MOBILE_DIR/../api" && pwd)"
MAESTRO_DIR="$MOBILE_DIR/maestro"

# Benzersiz e-posta — saniye damgalı (Date.now scriptte yasak değil, bash'te serbest).
STAMP="$(date +%s)"
REG_EMAIL="maestro-j1-${STAMP}@demo.com"
REG_PASSWORD="Demo123!"
REG_NAME="Maestro Alıcı ${STAMP}"

step() { printf '\n\033[1;35m=== %s ===\033[0m\n' "$1"; }
driver() { ( cd "$API_DIR" && node scripts/journey-driver.js "$@" --email "$REG_EMAIL" ); }
ui() {
  ( cd "$MOBILE_DIR" && \
    EXPO_PUBLIC_MAESTRO_NO_AUTOLOGIN=1 \
    bash maestro/run.sh "maestro/flows/$1" \
      --env REG_EMAIL="$REG_EMAIL" \
      --env REG_PASSWORD="$REG_PASSWORD" \
      --env REG_NAME="$REG_NAME" )
}

step "Yolculuk 1 başlıyor — alıcı: $REG_EMAIL"

step "Segment A (UI): misafir gez + kayıt — simülatörü izle"
ui "J1-a-register-buy.yaml"

step "Driver: email doğrula + default adres seed et"
driver verify-email
driver seed-address

step "Segment B (UI): giriş + sepet + checkout + ödeme — simülatörü izle"
ui "J1-b-login-buy.yaml"

step "Driver: fatura assert + satıcı kargolama/teslim simülasyonu"
driver assert-invoice
driver advance-to-delivered

step "Segment C (UI): teslim onayı — simülatörü izle"
ui "J1-c-confirm-delivery.yaml"

step "Driver: sipariş completed + hold released assert"
driver assert-completed

step "✅ Yolculuk 1 tamamlandı — alıcı: $REG_EMAIL"
```

- [ ] **Step 2: Çalıştırılabilir yap**

Run: `chmod +x apps/mobile/maestro/journeys/run-journey-1.sh`
Expected: çıktı yok, exit 0.

- [ ] **Step 3: pnpm kısayolu ekle**

`apps/mobile/package.json` `scripts` bloğuna, `"maestro:dev"` satırının altına ekle:

```json
    "maestro:journey1": "bash maestro/journeys/run-journey-1.sh",
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/maestro/journeys/run-journey-1.sh apps/mobile/package.json
git commit -m "feat(maestro): Yolculuk 1 orkestratörü (UI segmentleri + driver, benzersiz REG_EMAIL)"
```

---

## Task 9: Uçtan uca koşum + görsel doğrulama

**Files:** (yok — koşum/doğrulama task'ı)

- [ ] **Step 1: Ön koşulları doğrula**

Run:
```bash
cd apps/api && grep -q "PAYMENT_BYPASS=true" .env && echo "BYPASS OK" || echo "EKSIK: .env'e PAYMENT_BYPASS=true ekle"
lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null && echo "API OK" || echo "EKSIK: cd apps/api && pnpm dev"
xcrun simctl list devices booted | grep -q Booted && echo "SIM OK" || echo "EKSIK: simülatör aç + uygulama yükle"
```
Expected: `BYPASS OK`, `API OK`, `SIM OK`. Eksik varsa giderilir.

> Not: Metro şu an `EXPO_PUBLIC_MAESTRO` olmadan çalışıyorsa, orkestratör auto-login'i `NO_AUTOLOGIN` ile zaten kapatır; ama Metro'nun `EXPO_PUBLIC_MAESTRO=1` ile başlamış olması gerekir (password unmask + testID). Çalışan Metro'yu durdur (`/tmp/tarodan-metro.log`'a bakan terminal ya da port 8081 process) ki harness onu doğru env ile yeniden başlatsın: `lsof -ti:8081 | xargs kill` sonra orkestratör Metro'yu doğru env ile açar.

- [ ] **Step 2: Yolculuğu koş ve simülatörü izle**

Run: `cd apps/mobile && pnpm maestro:journey1`
Expected (simülatörde görünür, terminalde sırayla):
- Segment A: app açılır, misafir home, arama, ürün detay, kayıt formu doldurulur, submit → login ekranı. `[PASS]`.
- Driver: `✅ email doğrulandı`, `✅ default adres seed edildi`.
- Segment B: yeni kullanıcı girişi, sepete ekleme, checkout, bypass ödeme, "ORD-" görünür. `[PASS]`.
- Driver: `✅ fatura mevcut: INV-…`, `✅ sipariş ORD-… → delivered`.
- Segment C: Siparişlerim → "Teslim Aldım" → tamamlandı. `[PASS]`.
- Driver: `✅ hold released`, `✅ sipariş ORD-… completed`.
- `✅ Yolculuk 1 tamamlandı`.

- [ ] **Step 3: Hata halinde teşhis**

Herhangi bir segment `[FAILED]` olursa:
- Maestro hangi adımda takıldığını ve beklenen selector'ı raporlar; ilgili flow YAML'ındaki selector'ı simülatördeki gerçek metne/testID'ye göre düzelt (`maestro studio` ile canlı incele).
- Driver `❌` ile exit ederse, mesaj hangi state'in eksik olduğunu söyler (ör. fatura yok → bypass ödeme tamamlanmamış); önceki UI segmentine dön.
- Düzeltme sonrası `pnpm maestro:journey1` tekrar koşulur (her run yeni `REG_EMAIL` ile temiz başlar).

- [ ] **Step 4: Yeşil koşum sonrası — değişiklik yoksa commit gerekmez**

Bu task doğrulama; kod değişikliği yapıldıysa ilgili task'ın commit adımı tekrar uygulanır.

---

## Self-review notları (yazım sonrası)

- **Spec kapsamı:** harness (Task 1-2), hibrit driver (Task 5), Yolculuk 1 segment haritası (Task 6/6b/7), görünürlük garantisi (run.sh ön plan + booted sim + orkestrator step logları) — hepsi karşılanıyor.
- **Katman geçişi:** 8/10. adımlar driver'da (advance-to-delivered, assert-completed); confirmDelivery'nin hold release'i tetiklediği gerçeği assert-completed ile doğrulanıyor.
- **Bilinen kabul:** PayTR bypass, email token yerine doğrudan `isEmailVerified`, hold anında release — spec "Dürüst sınırlar" ile uyumlu.
- **Belirsizlik kapatma:** segment A login UI'da biter (driver verify gerektiği için), login+buy ayrı segment B'ye alındı — spec'teki "J1-a checkpoint" notu bu şekilde netleşti.
```
