# Web ↔ Mobil Parity — Canlı Doğrulama Tasarımı

**Tarih:** 2026-06-06
**Çıktı türü:** Canlı doğrulama + bulgu raporu (kod düzeltmesi ikincil)
**Kapsam:** Web'de (`apps/web`) çalışan her kritik işlevin mobilde (`apps/mobile`) de çalıştığını, hem manuel hem otomatik (Maestro) kontrollerle ve canlı API çağrılarıyla doğrulamak.

---

## 1. Amaç ve başarı kriterleri

**Amaç:** "Web'de çalışan işlev mobilde de çalışıyor mu?" sorusunu akış akış, kanıta dayalı yanıtlamak. Asıl teslimat, çalışan/bozuk/eksik işlevleri listeleyen bir **bulgu raporu**dur. Kod düzeltmesi ikincildir (bkz. §6).

**"Bitti" tanımı:**
- 11 kritik akışın her biri 4-adımlı yöntemden (§4) geçip rapora bir durum satırı yazdı.
- Tüm `❌ bozuk` / `⛔ eksik` bulgular kuyrukta; önem + web-karşılığı + kanıt ile.
- Engelleyici (blocker) bulgular çözülmüş.
- Watchdog takılma günlüğü dolduruldu.
- Kullanıcıya tek özet: ne çalışıyor, ne bozuk, ne eksik, sıradaki düzeltme önerisi.

---

## 2. Ortam ve kısıtlar (kararlar)

| Konu | Karar |
|------|-------|
| Backend ortam | Yerel stack (docker + `pnpm dev`), API `:3001` |
| Mobil çalıştırma | iOS Simulator (Expo + Maestro) |
| Ödeme | `PAYMENT_BYPASS=true` — uçtan uca akış (PayTR'ye gitmeden `bypass-complete`) |
| Kargo | Surat stub modu (`SURAT_SOAP_MODE=stub`, `SURAT_KARGO_TEST_MODE=true`) — gerçek takip no üretir, dış servise gitmez |
| Yaklaşım | Akış-bazlı dikey doğrulama (saf A) |

**Not — ödeme:** PayTR localhost'a callback gönderemez (kod yorumunda belirtilmiş: ngrok gerekir). Bu yüzden ödeme akışı `PAYMENT_BYPASS=true` ile doğrulanır; bu bizim akışımızı (stok düşümü, sipariş durumu, komisyon, bildirim) test eder, PayTR'nin kendisini değil. `.env` değişikliği commit'lenmez.

---

## 3. Ortam kurulumu (önce servisleri çalıştır)

1. **Altyapı:** `pnpm docker:up` → Postgres, Redis, Elasticsearch, MailHog.
2. **DB:** `pnpm db:migrate` + `pnpm db:seed` (seed/test kullanıcıları: `TEST_HESAPLARI.md`).
3. **Env (sadece yerel `.env`, commit yok):** `PAYMENT_BYPASS=true`. Kargo stub'a dokunulmaz.
4. **Backend:** API `:3001` + workers (shipping/payment/email). `pnpm dev` (veya `pm2:start`).
5. **Mobil:** `apps/mobile` → Expo, iOS Simulator; `localhost:3001/api`'ye bağlanır.
6. **Smoke kapısı (geçmeden akışa başlanmaz):**
   - API `/health` 200 mü?
   - Seed kullanıcı login → token alınıyor mu?
   - Mobil açılış ekranı API'ye bağlanıyor mu?

Çıktı: "stack ayakta + mobil bağlı" teyidi; kurulum sorunları (port çakışması, migration hatası) rapora not.

---

## 4. Akış envanteri + her akışın doğrulama yöntemi

### Doğrulanacak akışlar (öncelik sırasıyla)

| # | Akış | Kritik API'ler | Maestro flow(ları) |
|---|------|----------------|--------------------|
| 1 | Auth (login, register, register-business, forgot/reset, verify-email, logout) | `/auth/*` | 01, 02, F-01..04 |
| 2 | Arama & filtre & kategori | `/products`, `/listings`, ES search | 03, F-06/07 |
| 3 | Ürün detay & favori | `/products/:id`, `/wishlist` | F-08 |
| 4 | Sepet & Checkout & Ödeme | `/orders`, `/orders/quote`, `/payments` (bypass) | 04, D-01, F-09 |
| 5 | Kargo / teslimat | `/shipping`, addresses, tracking (stub) | E-04, order-track |
| 6 | Takas (ürün + nakit ödeme) | `/trades/*`, `/payments` trade-cash | D-04, E-04/06 |
| 7 | Teklif (offers) | `/offers/*`, commission preview batch | E-03, F-10 |
| 8 | Üyelik satın alma | `/membership/*`, payment | D-02, E-05 |
| 9 | Mesajlar & bildirim | `/messages`, `/notifications` | D-05, E-07 |
| 10 | İade / dispute | `/refund-requests`, `/disputes` | E-02 |
| 11 | Satıcı paneli (sales, sipariş detay) | `/seller/*`, `/sales/*` | 05, D-03 |

**Kapsam dışı (ikincil):** saved-searches, newsletter, statik bilgi/legal sayfaları, sitemap.

### Her akış için sabit 4-adımlı yöntem

1. **API canlı çağrı:** Akışın çekirdek endpoint'ini seed token'ıyla gerçekten çağır (curl/script). İstek/yanıt kaydet. → API katmanı yeşil mi?
2. **Mobil kod uyumu:** Mobilin (`packages/api-client` + ekran) web ile aynı endpoint/parametreyi kullandığını teyit et (`apps/mobile/docs/WEB_MOBILE_PARITY.md` referansıyla; diff varsa not).
3. **Maestro auto-run:** İlgili flow'u iOS sim'de koştur; geçti/kaldı + ekran görüntüsü.
4. **Manuel kontrol:** Maestro'nun kapsamadığı kenar durumları elle (`apps/mobile/docs/manual-test/`) — örn. ödeme sonrası stok güncelleniyor mu, hata metni doğru mu.

Her akış bu 4 adımdan **bir satır sonuç** üretir:
`✅ tam | ⚠️ kısmi (neden) | ❌ bozuk (kanıt) | ⛔ eksik`.

---

## 5. Takılma izleme & kurtarma (watchdog)

Önceki test turlarında kod takılmaları uzun beklemelere yol açtı. Bunu zaman aşımı + periyodik nabız + otomatik kurtarma ile çözeriz. **Uygulama:** her adımda foreground sert zaman aşımı (ana güvenlik) + uzun adımlar sürerken hafif arka plan nabzı (3 dk).

### Adım başına zaman aşımı bütçeleri

| Adım | Bütçe | Aşılırsa |
|------|-------|----------|
| `docker:up` / migration | 3 dk | Konteyner logları, port/volume çakışması çöz, yeniden dene |
| API açılış (`pnpm dev`) | 2 dk | Port 3001 dolu mu, prisma generate hatası mı — logdan teşhis |
| Tek API çağrısı | 30 sn | Asılı endpoint = ❌ bulgu; iptal et, işaretle, devam |
| Expo/Metro bundle | 8 dk | Cache temizle (`--clear`), tekrar |
| Tek Maestro flow | 5 dk | Flow'u öldür, screenshot al, "donma" notu, sıradakine geç |

### Periyodik nabız — her 3 dakikada bir (uzun adımlar sürerken)

1. API `/health` 200 dönüyor mu? (process canlı mı)
2. Metro bundler portu yanıt veriyor mu?
3. iOS Simulator yanıt veriyor mu (Maestro asılı değil mi)?
4. Docker konteynerleri `Up` mı?

### Takılma kurtarma döngüsü (systematic-debugging)

1. **Yakala:** son loglar + hangi port/process + son komut çıktısı.
2. **Teşhis:** kök neden (port çakışması, OOM, bayat prisma client, watchman, sonsuz await...).
3. **Çöz:** ilgili servisi hedefli restart et (tüm stack'i değil); kod takılması ise minimal düzelt.
4. **Devam:** takılan akışı baştan değil **kaldığı adımdan** sürdür; her takılma + çözüm rapora 1 satır.

---

## 6. Bozuk/eksik bulgu işleme

Çıktı rapor olduğu için kural nettir:

- **Varsayılan:** bulguyu rapora yaz, **kod düzeltmesine geçme**, sıradaki akışa devam et. Doğrulama akışı kesilmez.
- **İki istisna — anında düzeltilir:**
  1. **Engelleyici (blocker):** bir akış başka akışların doğrulanmasını da imkânsız kılıyorsa (örn. login bozuk → hiçbir şey test edilemez).
  2. **Tek satırlık aşikar düzeltme:** yanlış endpoint adı, eksik parametre gibi 1-2 satırlık net hata — düzelt, tekrar doğrula, rapora "düzeltildi" yaz.
- Geri kalan tüm düzeltmeler **bulgu kuyruğuna** gider; doğrulama bitince birlikte önceliklendirilir (ayrı iş).

---

## 7. Sıralama (bağımlılık güdümlü)

1. Ortam kurulumu + smoke kapısı (§3)
2. **Auth** (her şeyin önkoşulu)
3. Arama → ürün → favori (okuma akışları, düşük risk, hızlı güven)
4. Checkout+ödeme → kargo (kritik para/teslimat zinciri)
5. Takas → teklif → üyelik (işlem akışları)
6. Mesaj/bildirim → iade/dispute → satıcı paneli
7. Kapanış: rapor özeti + bulgu önceliklendirme

---

## 8. Bulgu raporu formatı

Tek canlı doküman: `apps/mobile/docs/WEB_MOBILE_VERIFICATION_REPORT.md`.

**Yapı:**
1. **Üst özet:** tarih, ortam (yerel / iOS sim / bypass / stub), genel skor tablosu (11 akış × durum).
2. **Akış başına bölüm** — 4-adım sonucu:
   ```
   ## 4. Sepet & Checkout & Ödeme — ⚠️ kısmi
   - API: POST /orders/quote ✅ (200, pricing döndü) | POST /payments ✅ bypass-complete
   - Mobil kod: checkout/index.tsx aynı endpoint ✅
   - Maestro: 04-checkout-bypass ✅ geçti (screenshot: ...)
   - Manuel: ödeme sonrası stok güncellendi ✅ / fatura adresi ekranı ⛔ eksik (web'de var)
   - Bulgu: BUG-007 — fatura adresi mobilde yok
   ```
3. **Bulgu listesi (aksiyon kuyruğu):** `BUG-NNN | akış | önem (kritik/orta/düşük) | web'de var/yok | kanıt | önerilen düzeltme`. Kritik = kargo/ödeme/auth bozulması.
4. **Takılma günlüğü:** watchdog'un yakaladığı her donma + kök neden + çözüm (1 satır).
5. **Kapanış:** kaç ✅ / ⚠️ / ❌ / ⛔, kalan iş.

---

## 9. Referanslar

- `apps/mobile/docs/WEB_MOBILE_PARITY.md` — akış ↔ dosya eşlemesi (bakım gerektirir)
- `apps/mobile/docs/WEB_MOBILE_GAP_ANALYSIS.md` — stratejik gap (2026-03-12, bayat; bu doğrulama onu tazeleyecek)
- `apps/mobile/maestro/flows/` — otomatik test akışları
- `apps/mobile/docs/manual-test/` — manuel test checklist'leri
- `TEST_HESAPLARI.md` — seed/test kullanıcıları
