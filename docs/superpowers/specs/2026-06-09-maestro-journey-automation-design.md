# Maestro Journey Automation — Tasarım

**Tarih:** 2026-06-09
**Durum:** Onaylandı (tasarım), implementation plan bekliyor
**Kapsam:** Önce mevcut suite'i güvenilir koşturulabilir hale getir; sonra kullanıcının sırayla verdiği uçtan uca "journey"leri Maestro otomasyonuna çevir.

## Amaç

Manuel yapılan uçtan uca test yolculuklarını, **booted iOS simülatöründe görünür şekilde** koşan ve hem **UI** hem **işlev (backend state)** açısından doğrulayan otomasyona çevirmek. Kullanıcı simülatörde Maestro'nun gezindiğini gözüyle izleyecek; her journey en ince ayrıntısına kadar doğrulanacak.

Çalışma modu **interaktif**: kullanıcı journey'leri tek tek verir, her biri çalışan bir flow + (gerekirse) driver script'e dönüştürülüp koşturulur ve görsel olarak doğrulanır.

## Mevcut durum (keşif özeti)

- `apps/mobile/maestro/` altında **46 flow + 5 subflow**, hepsi etiketli (`smoke`/`regression`/`manual`).
- Tüm flow'lar **dev build**'i hedefliyor: `appId: com.tarodan.app` (simülatörde kurulu olan).
- **Auto-login bağlı**: [authStore.ts](../../../apps/mobile/src/stores/authStore.ts) `loadToken` içinde `EXPO_PUBLIC_MAESTRO === '1'` ise boot'ta `POST /auth/login` ile otomatik giriş yapar (default `zeynep@demo.com`). Compile-time dead-code elimination ile prod'a sızmaz.
- **Maestro CLI kurulu** (`~/.maestro/bin/maestro`).
- **F-23** zaten alıcı UI bypass zincirini yapıyor: ara → sepete ekle → checkout → ödeme bypass → sipariş oluştu → Siparişlerim'de görünür.
- **README drift**: dosyanın üst kısmı "Expo Go, dev build gerektirmez" diyor; gerçekte flow'lar dev build + `EXPO_PUBLIC_MAESTRO` auto-login kullanıyor (alt kısım doğru). Düzeltilecek.

### Eksik / engeller
- Uygulama şu an `EXPO_PUBLIC_MAESTRO=1` olmadan çalışıyor → auto-login devre dışı → "home'dasın" varsayan flow'lar login'de takılır. Metro bu env ile başlatılmalı.
- Tek komutluk, tekrarlanabilir bir yerel runner yok (env + health + Metro + maestro elle birleştiriliyor).
- Uçtan uca yaşam döngüsü journey'leri için satıcı/backend/zaman geçişlerini yapan "driver" altyapısı yok (README F-20/F-21/F-24 için elle `prisma.update` öneriyor).

## Mimari

İki bileşen:

### 1. Koşum harness'i (`run.sh` + `pnpm maestro:dev <flow>`)
Sırasıyla:
1. Backend health: `GET /api/categories` → 200 değilse uyar/dur.
2. Booted simülatör var mı kontrol et.
3. Metro `EXPO_PUBLIC_MAESTRO=1` (ve gerekiyorsa `EXPO_PUBLIC_MAESTRO_EMAIL`) ile ayakta mı; değilse başlat, bundle hazır olana kadar bekle.
4. `maestro test <flow>` → booted simülatörde **görünür** koşar.
5. Hardware keyboard ayarı (secureTextEntry için) bir kez uygulanır.

README drift'i bu iş kapsamında düzeltilir.

### 2. Hibrit journey orkestrasyonu
Maestro bir flow ortasından shell çağıramaz. Bu yüzden uçtan uca yaşam döngüsü journey'leri **segmentlere** bölünür; runner, UI segmentleri ile driver script çağrılarını sırayla koşturur.

Driver script (`apps/api/scripts/journey-driver.js` veya benzeri), Prisma/API üzerinden alıcının telefonundan yapılamayan geçişleri yapar (satıcı kargolama, teslim, hold-release) ve ara doğrulamaları assert eder.

Her run için runner **benzersiz e-posta** üretir (`REG_EMAIL`), hem Maestro flow'una `--env` hem driver'a argüman olarak geçer; böylece driver doğru kullanıcı ve siparişi bulur.

## Bileşenler ve sınırlar

| Birim | Görev | Bağımlılık | Arayüz |
|---|---|---|---|
| `run.sh` / `pnpm maestro:dev` | Health + Metro + maestro orkestrasyonu | maestro CLI, simctl, pnpm | `maestro:dev <flow> [--email X]` |
| Journey UI flow(lar)ı | Alıcının yapabildiği UI adımları | dev build, auto-login | `maestro test` ile koşar; `--env REG_EMAIL` |
| Journey driver script | Satıcı/backend/zaman geçişleri + state assert | Prisma, bcrypt | `node journey-driver.js <step> --email X` |
| README | Çalıştırma rehberi (drift'siz) | — | dokümantasyon |

## Worked example — Yolculuk 1 (Yeni alıcı ilk alışveriş)

Segment sırası (runner tarafından orkestre edilir):

```
J1-a (UI)   : adım 1–6  misafir gez → ara+detay → kayıt → giriş → sepet → checkout → bypass ödeme → sipariş oluştu
driver J1   : adım 3,7,8 email-verify (token) [kayıt sonrası] · fatura assert · satıcı kargolar (tracking)
J1-b (UI)   : adım 9    alıcı Siparişlerim'de teslimatı onaylar
driver J1   : adım 10   hold release → satıcıya transfer → order completed
J1-c (UI)   : doğrulama sipariş durumu UI'da "Tamamlandı"
```

> Not: email-verify (adım 3) kayıt UI'sından hemen sonra çalışır; sırayı runner J1-a içinde checkpoint olarak ya da J1-a'yı ikiye bölerek halleder (plan aşamasında netleşecek).

### Adım → katman → doğrulama

| Adım | Katman | UI assert | İşlev (driver) assert |
|---|---|---|---|
| 1 misafir gez | UI | Kategoriler / Markalar / "Diecast pazaryeri" | — |
| 2 ara + detay | UI | ürün detay ekranı açılır | — |
| 3 kayıt + verify | UI + driver | kayıt formu submit, verify gate | EmailVerificationToken bulunur, `verify-email` ile `emailVerified=true` |
| 4 giriş + sepet | UI | sepet özeti: kargo + toplam | — |
| 5 Hemen Al → rezerve | UI + driver | checkout başlar | Order `pending_payment`, stok rezerve |
| 6 ödeme | UI (bypass) | başarı ekranı / "Tamamlandı" | `payment.status=completed` |
| 7 fatura | driver | (sonraki UI'da hesapta görünür) | Invoice kaydı oluştu |
| 8 kargo | driver | — | Shipment + tracking number |
| 9 teslim onay | UI | confirm-delivery butonu çalışır | shipment delivered |
| 10 hold release | driver | — | hold serbest, PayoutTransfer, Order `completed` |
| son | UI | sipariş "Tamamlandı" görünür | Order.status == completed |

## Görünürlük garantisi (zorunlu gereksinim)

Kullanıcı her journey'i **kendi açık simülatöründe gözüyle izleyecek**. Bu pazarlık konusu değil; harness şunları garanti eder:

1. **Halihazırda booted, görünür simülatöre** koşar — runner mevcut booted cihazı (`xcrun simctl list devices booted`) hedefler; yeni headless cihaz açmaz, cloud/CI'a göndermez.
2. **Arka planda koşmaz** — `maestro test` ön planda çalışır; uygulama penceresi önde kalır.
3. **clearState ile UI kararmaz** — subflow'lar `clearState: false` korunur; gereksiz app kill/relaunch yapılmaz.
4. **İzlenebilir tempo** — kritik adımlarda `waitForAnimationToEnd` / `extendedWaitUntil` kullanılır; gerekirse adımlar arası küçük görünür beklemeler eklenir ki kullanıcı geçişleri yakalayabilsin.
5. **Driver segmentleri sırasında** runner kısa bir görünür log basar ("satıcı kargoluyor…") ki kullanıcı UI dışı adımın ne zaman olduğunu bilsin; sonraki UI segmenti aynı görünür simülatörde devam eder.

## Doğrulama derinliği

- **UI**: her alıcı adımı `assertVisible` / `tapOn` (testID öncelikli, yoksa accessibility text) ile doğrulanır.
- **İşlev**: driver her geçişte ilgili DB/API durumunu assert eder (order/payment/invoice/hold/transfer). Başarısızlıkta non-zero exit → runner durur.
- İkisi birlikte "işlev + UI" tam kapsamı verir.

## Dürüst sınırlar (kaçınılmaz, kabul edildi)

1. **Gerçek PayTR kart ekranı** WebView olduğu için Maestro accessibility tree'sinden sürülemez → otomasyonda **PAYMENT_BYPASS** yolu kullanılır. Gerçek PayTR uçtan uca `apps/api/test/e2e`'de imzalı callback ile zaten kapsanıyor.
2. **E-posta doğrulama** gerçek inbox yerine token script ile (`EmailVerificationToken` → `verify-email`).
3. **Hold bekleme süresi** beklenmez; driver release'i anında zorlar (zaman bağımlılığını kaldırmak için).

## Test stratejisi

- Harness'in kendisi: `pnpm maestro:dev flows/01-smoke.yaml` ile smoke yeşil → harness doğrulanır.
- Journey 1: runner tüm segmentleri sırayla koşar; herhangi bir UI veya driver assert'i fail ederse zincir durur ve hata raporlanır.
- Her journey bağımsız: benzersiz `REG_EMAIL` ile kendi kullanıcısını/siparişini yaratır, paylaşılan state varsaymaz.

## Bu spec'in dışında (sonraki journey'ler)

Kullanıcı journey'leri sırayla verecek. Her yeni journey aynı modeli kullanır: UI segment(ler)i + gerekiyorsa driver adım(lar)ı. Driver script journey'ler arası ortak adımları (kargola, teslim et, release, email-verify) yeniden kullanılabilir komutlar olarak büyütür.
